import React, { forwardRef, useCallback, useRef, useState } from "react";
import { ART_VIEWBOX, ART_W, ART_H, INNER_RING_D, RING2_D, RING3_D } from "./RippleArt.jsx";

/* ------------------------------------------------------------------
   RippleUnit — one tappable, draggable ripple on the home screen.

   Layout: `size` in LAYOUT is the unit's design diameter (vmin). The
   artwork is drawn ART_SCALE× larger than that so its outer dotted
   rings reach over the neighbours, like the key visual; the tappable
   core and the label sit at the centre.

   Interaction (pointer events on the core):
   - press and release with < DRAG_THRESHOLD px of travel → tap → open
   - move further → drag; the shared dragRef feeds useUnitPhysics, which
     makes the unit follow the finger and shove its neighbours; the
     release point becomes its new home
   Keyboard activation (Enter / Space) still opens the tour.

   Motion is applied from outside (useUnitPhysics writes the wrapper's
   transform every frame).
   ------------------------------------------------------------------ */

export const ART_SCALE = 1.6;    // artwork width ÷ design size
const HIT_FRAC = 0.8;            // tappable core diameter ÷ design size (units breathe down to 0.3×)
const PULSE_COUNT = 2;
const DRAG_THRESHOLD = 10;       // px

const rnd = (i, n) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };

const RippleUnit = forwardRef(function RippleUnit({ tour, layout, index, onOpen, dragRef, focused, dimmed }, ref) {
  const [sonars, setSonars] = useState([]);
  const press = useRef(null);
  const pulsePeriod = (6.5 + rnd(index, 7) * 2.5).toFixed(2);

  const spawnSonar = () => setSonars((s) => [...s, Date.now() + Math.random()]);
  const removeSonar = (id) => setSonars((s) => s.filter((x) => x !== id));

  const open = useCallback(() => {
    spawnSonar();
    onOpen(tour, index);
  }, [onOpen, tour, index]);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (focused || dimmed) return;                 // a tour is open: units are not interactive
    const wrapper = e.currentTarget.closest(".ripple-unit");
    const r = wrapper.getBoundingClientRect();
    press.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false,
      grabDX: e.clientX - (r.left + r.width / 2),
      grabDY: e.clientY - (r.top + r.height / 2)
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* synthetic / stale pointer */ }
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      p.dragging = true;
      e.currentTarget.classList.add("is-dragging");
    }
    dragRef.current = { index, active: true, x: e.clientX, y: e.clientY, grabDX: p.grabDX, grabDY: p.grabDY };
  };

  const endPress = (e, cancelled) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    e.currentTarget.classList.remove("is-dragging");
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    if (p.dragging) {
      dragRef.current = { ...dragRef.current, active: false };
    } else if (!cancelled) {
      open();
    }
  };

  // keyboard activation only (mouse/touch taps are handled via pointer events)
  const onClick = (e) => { if (e.detail === 0) open(); };

  const artW = layout.size * ART_SCALE;               // vmin (design size is % of the short side)
  const hitPct = (HIT_FRAC / ART_SCALE) * 100;        // % of the unit box
  const labelPct = (1.1 / ART_SCALE) * 100;

  return (
    <div
      ref={ref}
      className={`ripple-unit${focused ? " is-focus" : ""}${dimmed ? " is-dim" : ""}`}
      style={{
        left: `${layout.cx}%`,
        top: `${layout.cy}%`,
        width: `${artW}vmin`,
        aspectRatio: `${ART_W} / ${ART_H}`
      }}
    >
      <svg className="unit-art" viewBox={ART_VIEWBOX} aria-hidden="true">
        <use href="#kv-ripple" />
        {/* hero highlight: the artwork's own inner rings, lit up — ring 1 always
            while focused, rings 2/3 progressively with the audio level */}
        <path className="hero-ring hero-ring-1" d={INNER_RING_D} />
        <path className="hero-ring hero-ring-2" d={RING2_D} />
        <path className="hero-ring hero-ring-3" d={RING3_D} />
        {Array.from({ length: PULSE_COUNT }, (_, p) => (
          <path
            key={p}
            className="pulse"
            d={INNER_RING_D}
            style={{
              animationDuration: `${pulsePeriod}s`,
              animationDelay: `${(-(p * pulsePeriod) / PULSE_COUNT).toFixed(2)}s`
            }}
          />
        ))}
      </svg>

      <button
        type="button"
        className="ripple-btn"
        aria-label={tour.title}
        data-id={tour.id}
        style={{ width: `${hitPct}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPress(e, false)}
        onPointerCancel={(e) => endPress(e, true)}
        onClick={onClick}
      >
        <span className="ripple-visual">
          {sonars.map((id) => (
            <span key={id} className="sonar" onAnimationEnd={() => removeSonar(id)} />
          ))}
        </span>
      </button>

      <div
        className="label"
        style={{ width: `${labelPct}%`, fontSize: `${layout.size * 0.125}vmin` }}
      >
        <span className="num">{String(tour.id).padStart(2, "0")}</span>
        <span className="title">{tour.title}</span>
      </div>
    </div>
  );
});

export default RippleUnit;
