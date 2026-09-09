import React, { useCallback, useEffect, useRef } from "react";
import RippleDefs, { useRippleBitmap } from "./RippleArt.jsx";
import RippleUnit from "./RippleUnit.jsx";
import InstallGuide from "./InstallGuide.jsx";
import useUnitPhysics from "../hooks/useUnitPhysics.js";
import { addRipple } from "../lib/ripples.js";
import { LAYOUT } from "../data/tours.js";

/* The home layer is always mounted. `focus` ≥ 0 means a tour is open:
   that unit swims to the hero spot (physics), the others fade out and
   stop reacting to touch. */
export default function HomeScreen({ tours, focus, onOpen, navRef }) {
  const fieldRef = useRef(null);
  const unitRefs = useRef([]);
  const tapSignal = useRef({ index: -1, t: 0 });
  const dragRef = useRef({ index: -1, active: false, x: 0, y: 0, grabDX: 0, grabDY: 0 });
  const focusRef = useRef(-1);
  focusRef.current = focus;
  const artSrc = useRippleBitmap();

  useUnitPhysics({ stageRef: fieldRef, unitRefs, layout: LAYOUT, tapSignal, dragRef, focusRef, navRef });

  /* centre of unit i in viewport px (follows the physics transform) */
  const unitCenter = (i) => {
    const el = unitRefs.current[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /* Ripples only ever start from a work's centre:
     - tap on open water: the nearest unit answers (home only)
     - ambient: every few seconds a random unit swells once;
       while a tour is open, only the hero does */
  useEffect(() => {
    const field = fieldRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onDown = (e) => {
      if (reduceMotion.matches || focusRef.current >= 0) return;
      if (e.target.closest(".ripple-btn")) return;   // unit taps emit their own
      let best = null, bestD = Infinity;
      for (let i = 0; i < LAYOUT.length; i++) {
        const c = unitCenter(i);
        if (!c) continue;
        const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) addRipple(best.x, best.y, 0.9);
    };
    field.addEventListener("pointerdown", onDown, { passive: true });

    let timer = 0;
    const schedule = () => {
      const f = focusRef.current;
      const [a, b] = f >= 0 ? [2.2, 3.8] : [2.8, 5.6];
      timer = window.setTimeout(() => {
        if (!document.hidden && !reduceMotion.matches) {
          const idx = focusRef.current >= 0 ? focusRef.current : Math.floor(Math.random() * LAYOUT.length);
          const c = unitCenter(idx);
          if (c) addRipple(c.x, c.y, focusRef.current >= 0 ? 0.5 : 0.3 + Math.random() * 0.25);
        }
        schedule();
      }, (a + Math.random() * (b - a)) * 1000);
    };
    schedule();

    return () => {
      field.removeEventListener("pointerdown", onDown);
      clearTimeout(timer);
    };
  }, []);

  const handleOpen = useCallback((tour, index) => {
    const c = unitCenter(index);
    if (c) addRipple(c.x, c.y, 1.8);       // a strong ripple from the work's centre
    tapSignal.current = { index, t: performance.now() };
    setTimeout(() => onOpen(index), 120);   // let the water react, then swim up
  }, [onOpen]);

  const focused = focus >= 0;

  return (
    <section id="home-screen" className={`screen active${focused ? " focused" : ""}`}>
      <header className="home-header">
        <div className="zh">時光渡口・記憶漣漪</div>
        <div className="en">Reawakening the Time and Memories of Shisizhang through Sound</div>
      </header>

      <div className={`ripple-field${focused ? " focused" : ""}`} ref={fieldRef}>
        <RippleDefs />
        {tours.map((tour, i) => (
          <RippleUnit
            key={tour.id}
            ref={(el) => { unitRefs.current[i] = el; }}
            tour={tour}
            layout={LAYOUT[i]}
            index={i}
            onOpen={handleOpen}
            dragRef={dragRef}
            focused={i === focus}
            dimmed={focused && i !== focus}
            artSrc={artSrc}
          />
        ))}
      </div>

      <div className="home-caption">點擊水波，聆聽歲月深處的回聲</div>

      <InstallGuide hidden={focused} />
    </section>
  );
}
