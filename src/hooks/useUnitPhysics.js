import { useEffect } from "react";
import { addRipple, pruneRipples, rippleWave, rippleDist, nowSec } from "../lib/ripples.js";
import { HERO } from "../data/tours.js";
import { ART_SCALE } from "../components/RippleUnit.jsx";

/* ------------------------------------------------------------------
   useUnitPhysics — a small soft-body simulation for the home-screen
   ripple units, written straight to the DOM (no React re-render per
   frame).

   Each unit:
   - has a home position (from LAYOUT, plus any shift the visitor gave it
     by dragging) and chases a slowly wandering target around it with lag
   - breathes between P.scaleRange on two superposed per-unit periods,
     so no two units share a size for long; the label counter-scales a
     little so titles stay legible when small
   - repels neighbours firmly when their inner rings would overlap;
     a swelling or dragged unit pushes the others away
   - gets pushed by the background ripples' wavefront (shared store)
   - can be dragged: it follows the finger on a firm spring, shoves the
     others aside, leaves a wake of ripples, and where it is released
     becomes its new home (kept inside the viewport)
   - can be focused (a tour is open): it swims to the HERO spot at the
     top and grows while the sheet rises below; on close it swims back
   - never leaves the viewport: the whole artwork (outer rings included)
     is kept inside by a soft wall plus a hard clamp; homes that sit too
     close to an edge are pulled in when the stage is measured

   All lengths are viewport pixels; the stage is measured on resize.
   ------------------------------------------------------------------ */

const P = {
  homeSpring: 1.2,     // pull toward the wander target (1/s²)
  damping: 2.6,        // velocity damping (1/s)
  wanderAmp: [0.045, 0.07],  // wander radius, fraction of the viewport's short side
  wanderPeriod: [13, 24],    // seconds
  scaleRange: [0.6, 1.2],    // every unit breathes across this same range
  breathPeriod: [10, 20],    // seconds (main breath)
  breathPeriod2: [23, 41],   // seconds (slow secondary swell)
  scaleLag: 1.0,       // how fast actual scale follows its target (1/s)
  contactFrac: 1.5,    // touching distance = contactFrac × (r_i + r_j), r = design radius × scale (1.14 = solid rings just touch)
  repel: 42.0,         // repulsion strength (1/s² per px of overlap, capped)
  repelCap: 90,        // px of overlap that count
  squeeze: 0.10,       // how much overlap shrinks a unit
  rippleForce: 3.2,    // gain on background-ripple displacement (1/s²)
  tapPulse: 0.08,      // extra scale on tap
  maxOffsetFrac: 0.2,  // hard clamp on how far a unit may wander from home (× short side)
  labelCounter: 0,     // label scales by s^-labelCounter (0 = with unit, 1 = constant size)

  dragSpring: 110,     // follow-the-finger spring (1/s²), firm but with a little give
  dragDamp: 16,        // its damping (1/s)
  dragShove: 2.2,      // how much harder a dragged unit pushes neighbours
  dragWakeGap: 70,     // px of travel between wake ripples
  dragWake: 0.32,      // wake ripple strength
  wallPad: 0.015,      // breathing room between the artwork's outer ring and the edge (× short side)
  wallSpring: 40,      // soft wall keeping the artwork inside the viewport (1/s²)
  wallDamp: 6,         // damping when pressing into the wall (1/s)
  homeScale: 0.85,     // scale assumed when pulling too-close-to-edge homes inward

  focusSpring: 26,     // swim to / from the hero spot (1/s²)
  focusDamp: 9.5,      // its damping (1/s)  → settles in ~0.7 s, slight overshoot
  focusBreath: 0.025,  // hero breathes ± this around HERO.scale
  returnTime: 1.6,     // seconds the return spring stays active after closing
  slideExit: 2.6       // prev/next: outgoing hero's sideways kick, × viewport width per second
};

/* deterministic per-unit random in [0,1) */
function rnd(i, n) {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const lerpR = (i, n, [a, b]) => a + rnd(i, n) * (b - a);

export default function useUnitPhysics({ stageRef, unitRefs, layout, tapSignal, dragRef, focusRef, navRef }) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const n = layout.length;

    let W = 1, H = 1, S = 1;   // S = short side, the design length unit
    const units = layout.map((l, i) => ({
      hx: 0, hy: 0, r: 1,          // layout home (px) + design radius (px), set in measure()
      sx: 0, sy: 0,                // home shift from dragging, fraction of W / H
      ox: 0, oy: 0,                // the same shift in px (derived)
      x: 0, y: 0, vx: 0, vy: 0,    // offset from (home + shift) + velocity
      s: 1, sTarget: 1, pulse: 0,  // scale
      returnUntil: 0,              // time until which the return spring applies
      wa: lerpR(i, 1, P.wanderAmp),
      wpx: lerpR(i, 2, P.wanderPeriod), wpy: lerpR(i, 3, P.wanderPeriod),
      wphx: rnd(i, 4) * Math.PI * 2, wphy: rnd(i, 5) * Math.PI * 2,
      bp: lerpR(i, 7, P.breathPeriod),
      bph: rnd(i, 8) * Math.PI * 2,
      bp2: lerpR(i, 9, P.breathPeriod2),
      bph2: rnd(i, 10) * Math.PI * 2,
      label: null
    }));
    const [sMin, sMax] = P.scaleRange;
    const sMid = (sMin + sMax) / 2, sHalf = (sMax - sMin) / 2;

    function measure() {
      const rect = stage.getBoundingClientRect();
      W = rect.width || 1; H = rect.height || 1; S = Math.min(W, H);
      units.forEach((u, i) => {
        u.r = (layout[i].size / 100) * S * 0.5;
        const m = halfArt(u, P.homeScale);
        u.hx = Math.min(W - m, Math.max(m, (layout[i].cx / 100) * W));
        u.hy = Math.min(H - m, Math.max(m, (layout[i].cy / 100) * H));
        u.ox = u.sx * W; u.oy = u.sy * H;
      });
      return rect;
    }
    /* half of the full artwork (outer dotted rings included) at scale s */
    function halfArt(u, s) { return u.r * ART_SCALE * s + P.wallPad * S; }
    let stageRect = measure();

    const cx = (u) => u.hx + u.ox + u.x;   // current centre, stage px
    const cy = (u) => u.hy + u.oy + u.y;

    function apply() {
      for (let i = 0; i < n; i++) {
        const el = unitRefs.current[i];
        if (!el) continue;
        const u = units[i];
        el.style.transform =
          `translate(-50%,-50%) translate3d(${(u.ox + u.x).toFixed(2)}px, ${(u.oy + u.y).toFixed(2)}px, 0) scale(${u.s.toFixed(4)})`;
        if (!u.label) u.label = el.querySelector(".label");
        if (u.label) {
          const ls = Math.pow(u.s, -P.labelCounter);
          u.label.style.transform = `translate(-50%,-50%) scale(${ls.toFixed(4)})`;
        }
      }
    }

    /* release a dragged unit: where it is now becomes home (inside the viewport) */
    function settle(u) {
      const m = halfArt(u, u.s);
      const nx = Math.min(W - m, Math.max(m, cx(u)));
      const ny = Math.min(H - m, Math.max(m, cy(u)));
      u.ox = nx - u.hx; u.oy = ny - u.hy;
      u.sx = u.ox / W; u.sy = u.oy / H;
      u.x = 0; u.y = 0;                     // keep vx / vy → a little momentum after release
    }

    let lastTap = tapSignal.current;
    let dragWasActive = false, dragIndex = -1;
    let wakeX = 0, wakeY = 0;
    let focusWas = -1;

    let raf = 0, prev = 0, running = true;
    function step(nowMs) {
      if (!running) return;
      raf = requestAnimationFrame(step);
      const t = nowMs / 1000;
      const dt = Math.min(0.05, prev ? t - prev : 0.016);
      prev = t;

      if (tapSignal.current !== lastTap) {
        lastTap = tapSignal.current;
        const u = units[lastTap.index];
        if (u) u.pulse += P.tapPulse;
      }

      /* focus transitions */
      const focus = focusRef.current;
      if (focus !== focusWas) {
        const dir = navRef && navRef.current ? navRef.current.dir : 0;
        const out = focusWas >= 0 ? units[focusWas] : null;
        const inn = focus >= 0 ? units[focus] : null;
        if (out) out.returnUntil = t + P.returnTime;
        if (out && inn && dir !== 0) {
          // carousel feel: the old hero is kicked out to one side (the return
          // spring then brings it home), the new one starts just off the other
          // side at hero size and glides in
          out.vx = -dir * P.slideExit * W;
          out.vy = 0;
          const startX = dir > 0 ? W + halfArt(inn, HERO.scale) : -halfArt(inn, HERO.scale);
          inn.x = startX - (inn.hx + inn.ox);
          inn.y = HERO.y * H - (inn.hy + inn.oy);
          inn.vx = 0; inn.vy = 0;
          inn.s = HERO.scale;
        }
        focusWas = focus;
      }

      /* drag state transitions */
      const drag = dragRef.current;
      const dragging = focus < 0 && drag.active && drag.index >= 0 && drag.index < n;
      if (dragging && !dragWasActive) {
        dragIndex = drag.index;
        const u = units[dragIndex];
        wakeX = cx(u); wakeY = cy(u);
      } else if (!dragging && dragWasActive) {
        const u = units[dragIndex];
        if (u) settle(u);
        dragIndex = -1;
      }
      dragWasActive = dragging;

      const ripples = pruneRipples(nowSec());
      const maxOff = P.maxOffsetFrac * S;

      for (let i = 0; i < n; i++) {
        const u = units[i];
        const isDragged = dragging && i === dragIndex;
        const isFocus = i === focus;
        const returning = !isFocus && t < u.returnUntil;
        let ax = 0, ay = 0;
        let sT;

        if (isFocus) {
          // swim to the hero spot and hold there, breathing gently
          const targetX = HERO.x * W, targetY = HERO.y * H;
          ax = (targetX - cx(u)) * P.focusSpring - u.vx * P.focusDamp;
          ay = (targetY - cy(u)) * P.focusSpring - u.vy * P.focusDamp;
          sT = HERO.scale + Math.sin(t * 0.9) * P.focusBreath;
        } else if (isDragged) {
          // follow the finger (pointer → stage px, minus the grab offset)
          const targetX = drag.x - stageRect.left - drag.grabDX;
          const targetY = drag.y - stageRect.top - drag.grabDY;
          ax = (targetX - cx(u)) * P.dragSpring - u.vx * P.dragDamp;
          ay = (targetY - cy(u)) * P.dragSpring - u.vy * P.dragDamp;
        } else {
          // wander target (slow, per-unit periods), chased with lag
          const tx = Math.sin((t / u.wpx) * Math.PI * 2 + u.wphx) * u.wa * S;
          const ty = Math.sin((t / u.wpy) * Math.PI * 2 + u.wphy) * u.wa * S * 0.8;
          if (returning) {
            ax = (tx - u.x) * P.focusSpring - u.vx * P.focusDamp;
            ay = (ty - u.y) * P.focusSpring - u.vy * P.focusDamp;
          } else {
            ax = (tx - u.x) * P.homeSpring;
            ay = (ty - u.y) * P.homeSpring;
          }
        }

        if (!isFocus) {
          // breathing scale target: two superposed sines, kept inside scaleRange
          const wave = 0.72 * Math.sin((t / u.bp) * Math.PI * 2 + u.bph)
                     + 0.28 * Math.sin((t / u.bp2) * Math.PI * 2 + u.bph2);
          sT = sMid + sHalf * wave;
        }

        // repulsion between units (the hero and a dragged unit barely yield)
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const v = units[j];
          const dx = cx(u) - cx(v);
          const dy = cy(u) - cy(v);
          const d = Math.hypot(dx, dy) || 1;
          const contact = (u.r * u.s + v.r * v.s) * P.contactFrac;
          const overlap = contact - d;
          if (overlap > 0) {
            const otherDragged = dragging && j === dragIndex;
            let f = Math.min(overlap, P.repelCap) * P.repel * 0.5;
            if (isDragged || isFocus) f *= 0.15;
            else if (otherDragged || j === focus) f *= P.dragShove;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
            if (!isFocus) sT -= (overlap / contact) * P.squeeze;
          }
        }

        // background ripples push the unit (positions in viewport px)
        if (ripples.length && !isDragged && !isFocus) {
          const px = stageRect.left + cx(u);
          const py = stageRect.top + cy(u);
          const vh = window.innerHeight || H;
          for (let k = 0; k < ripples.length; k++) {
            const r = ripples[k];
            const dx = px - r.x, dy = py - r.y;
            const d = rippleDist(dx, dy) || 1;
            const amp = rippleWave(d, nowSec() - r.t0, r.strength, vh);
            if (amp !== 0) {
              const e = Math.hypot(dx, dy) || 1; // push outward from the centre
              ax += (dx / e) * amp * P.rippleForce;
              ay += (dy / e) * amp * P.rippleForce;
            }
          }
        }

        // integrate
        u.vx += ax * dt; u.vy += ay * dt;
        if (!isDragged && !isFocus && !returning) {
          const damp = Math.max(0, 1 - P.damping * dt);
          u.vx *= damp; u.vy *= damp;
        }
        u.x += u.vx * dt; u.y += u.vy * dt;
        if (!isDragged && !isFocus && !returning) {
          const off = Math.hypot(u.x, u.y);
          if (off > maxOff) { u.x *= maxOff / off; u.y *= maxOff / off; }
        } else if (isDragged) {
          // wake: a small KV ripple every dragWakeGap px of travel
          const wx = cx(u), wy = cy(u);
          if (Math.hypot(wx - wakeX, wy - wakeY) > P.dragWakeGap) {
            wakeX = wx; wakeY = wy;
            if (!reduceMotion.matches) addRipple(stageRect.left + wx, stageRect.top + wy, P.dragWake);
          }
        }

        // keep the whole artwork inside the viewport: soft wall, then hard clamp
        if (!isFocus) {
          const m = halfArt(u, u.s);
          let px = cx(u), py = cy(u);
          if (px < m)          { u.vx += ((m - px) * P.wallSpring - Math.min(0, u.vx) * P.wallDamp) * dt; }
          else if (px > W - m) { u.vx += (((W - m) - px) * P.wallSpring - Math.max(0, u.vx) * P.wallDamp) * dt; }
          if (py < m)          { u.vy += ((m - py) * P.wallSpring - Math.min(0, u.vy) * P.wallDamp) * dt; }
          else if (py > H - m) { u.vy += (((H - m) - py) * P.wallSpring - Math.max(0, u.vy) * P.wallDamp) * dt; }
          px = cx(u); py = cy(u);
          const nx = Math.min(W - m, Math.max(m, px));
          const ny = Math.min(H - m, Math.max(m, py));
          if (nx !== px) { u.x += nx - px; if ((nx > px && u.vx < 0) || (nx < px && u.vx > 0)) u.vx *= 0.2; }
          if (ny !== py) { u.y += ny - py; if ((ny > py && u.vy < 0) || (ny < py && u.vy > 0)) u.vy *= 0.2; }
        }

        // scale follows target with lag; tap pulse decays
        u.pulse *= Math.max(0, 1 - 2.8 * dt);
        u.sTarget = (isFocus ? sT : Math.max(sMin * 0.9, sT)) + u.pulse;
        const lag = isFocus || returning ? 3.2 : P.scaleLag;
        u.s += (u.sTarget - u.s) * Math.min(1, lag * dt);
      }
      apply();
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      running = true; prev = 0;
      if (reduceMotion.matches) {
        // still layout; the focused unit still jumps to the hero spot
        units.forEach((u, i) => {
          const f = i === focusRef.current;
          u.x = f ? HERO.x * W - u.hx - u.ox : 0;
          u.y = f ? HERO.y * H - u.hy - u.oy : 0;
          u.s = f ? HERO.scale : 1;
        });
        apply();
        raf = requestAnimationFrame(function still() {
          // re-apply when focus changes even without motion
          if (!running) return;
          raf = requestAnimationFrame(still);
          if (focusRef.current !== focusWas) { focusWas = focusRef.current; start(); }
        });
      } else {
        raf = requestAnimationFrame(step);
      }
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    const onResize = () => { stageRect = measure(); };
    const onVisibility = () => (document.hidden ? stop() : start());
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener?.("change", start);

    start();
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener?.("change", start);
    };
  }, [stageRef, unitRefs, layout, tapSignal, dragRef, focusRef]);
}
