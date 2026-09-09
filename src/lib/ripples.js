/* ------------------------------------------------------------------
   Shared ripple store.

   A "ripple" is a disturbance on the water surface: created by a tap /
   drag on the screen, by tapping a tour unit, or ambiently (a stray
   drop). The WebGL backdrop reads the list to distort the background;
   the unit physics reads the same list so the wavefront nudges the
   floating ripples. Positions are viewport pixels (clientX / clientY).
   ------------------------------------------------------------------ */

export const RIPPLE = {
  MAX: 10,        // simultaneous ripples the shader handles
  FADE: 3.2,      // seconds a ripple lives
  SPEED: 0.26,    // wavefront speed, fraction of viewport height per second
  RADIUS: 0.05,   // initial band half-width, fraction of viewport height
  LAMBDA: 0.05,   // spacing between concentric swells, fraction of vh
  STRENGTH: 0.028, // peak displacement, fraction of vh (before per-ripple strength)
  SHAPE_P: 4       // superellipse exponent: 2 = circle, 4 = the KV rounded square
};

/* distance from a ripple centre in "KV ring" units: a superellipse
   (|x|^p + |y|^p)^(1/p), so every wavefront is the same rounded square
   as the artwork's rings, just larger */
export function rippleDist(dx, dy) {
  const p = RIPPLE.SHAPE_P;
  return Math.pow(Math.pow(Math.abs(dx), p) + Math.pow(Math.abs(dy), p), 1 / p);
}

const list = [];

export function nowSec() {
  return performance.now() / 1000;
}

export function addRipple(x, y, strength = 1) {
  list.push({ x, y, t0: nowSec(), strength });
  if (list.length > RIPPLE.MAX) list.shift();
}

export function pruneRipples(t = nowSec()) {
  while (list.length && t - list[0].t0 > RIPPLE.FADE) list.shift();
  return list;
}

export function getRipples() {
  return list;
}

/* Displacement (px, along the shape normal) a ripple exerts at squircle
   distance `d` px from its centre, `age` seconds after it started. Mirrors the shader maths so the
   background and the floating units move to the same wave. `vh` is the
   viewport height in px. */
export function rippleWave(d, age, strength, vh) {
  if (age < 0 || age > RIPPLE.FADE) return 0;
  const life = age / RIPPLE.FADE;
  const front = age * RIPPLE.SPEED * vh;
  const sigma = RIPPLE.RADIUS * vh * (0.6 + life * 1.6);
  const w = d - front;
  const env = Math.exp(-(w * w) / (2 * sigma * sigma));
  const rings = Math.cos((w / (RIPPLE.LAMBDA * vh)) * Math.PI * 2);
  const decay = (1 - life) * (1 - life);
  return strength * RIPPLE.STRENGTH * vh * env * decay * rings;
}
