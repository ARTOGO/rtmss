import React, { useEffect, useRef } from "react";
import { RIPPLE, pruneRipples, nowSec } from "../lib/ripples.js";

/* ------------------------------------------------------------------
   WaterBackdrop — the whole background as one WebGL surface:

     1. the brand gradient (same stops / pools as the CSS fallback that
        sits underneath in #stage-outer, so if WebGL is unavailable the
        page looks the same, just still)
     2. faint moving water-light (domain-warped fbm caustics)
     3. ripple distortion: every active ripple pushes the sampling
        coordinates outward in concentric swells that spread and fade,
        with a soft glint on the wave shoulders — so taps visibly
        disturb the water

   Ripples are the same rounded square as the KV artwork's rings (a
   superellipse distance field) and are only ever emitted from the
   centre of a tour unit (see HomeScreen: unit taps, taps on open water
   answered by the nearest unit, and an ambient swell from a random unit
   every few seconds). This component just renders the shared store.

   iPad 7 budget: reduced internal resolution, ≤30 fps, pause when
   hidden, one still frame under prefers-reduced-motion.
   ------------------------------------------------------------------ */

const RENDER_SCALE = 0.42;
const MAX_FPS = 30;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
#define MAXR ${RIPPLE.MAX}

uniform vec2  u_res;
uniform float u_time;
uniform float u_angle;       // CSS gradient angle, radians
uniform vec4  u_ripples[MAXR]; // x, y (aspect-corrected uv), t0, strength
uniform int   u_count;
uniform float u_fade, u_speed, u_radius, u_lambda, u_strength, u_shape;

/* superellipse distance + outward normal: the KV rounded square */
float sqDist(vec2 v){
  vec2 a = pow(abs(v) + 1e-5, vec2(u_shape));
  return pow(a.x + a.y, 1.0 / u_shape);
}
vec2 sqNormal(vec2 v){
  vec2 g = sign(v) * pow(abs(v) + 1e-5, vec2(u_shape - 1.0));
  return g / max(length(g), 1e-6);
}

/* ---- brand palette ---- */
const vec3 TEAL_DEEP = vec3(0.039, 0.290, 0.282); // #0a4a48
const vec3 TEAL      = vec3(0.047, 0.424, 0.424); // #0c6c6c
const vec3 TEAL_MID  = vec3(0.373, 0.565, 0.573); // #5f9092
const vec3 MIST      = vec3(0.573, 0.682, 0.698); // #92aeb2
const vec3 SAND      = vec3(0.769, 0.769, 0.659); // #c4c4a8
const vec3 CREAM     = vec3(0.867, 0.812, 0.643); // #ddcfa4
const vec3 PEACH     = vec3(0.812, 0.627, 0.478); // #cfa07a
const vec3 CLAY      = vec3(0.706, 0.420, 0.298); // #b46b4c
const vec3 RUST      = vec3(0.604, 0.263, 0.196); // #9a4332

/* piecewise-linear stop helper */
vec3 stop(vec3 acc, float t, float t0, float t1, vec3 c0, vec3 c1){
  if (t >= t0 && t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  return acc;
}
float ramp(float d, float d0, float a0, float d1, float a1, float d2){
  // alpha a0 at d0, a1 at d1, 0 at d2
  if (d <= d1) return mix(a0, a1, clamp((d - d0) / max(d1 - d0, 1e-4), 0.0, 1.0));
  return mix(a1, 0.0, clamp((d - d1) / max(d2 - d1, 1e-4), 0.0, 1.0));
}
/* p in CSS coords (0..1, y down) */
vec3 brandGradient(vec2 p){
  float W = u_res.x, H = u_res.y;
  float L = abs(W * sin(u_angle)) + abs(H * cos(u_angle));
  float t = 0.5 + ((p.x - 0.5) * W * sin(u_angle) + (p.y - 0.5) * H * (-cos(u_angle))) / L;
  t = clamp(t, 0.0, 1.0);
  vec3 c = RUST;
  c = stop(c, t, 0.00, 0.14, TEAL_DEEP, TEAL);
  c = stop(c, t, 0.14, 0.30, TEAL, TEAL_MID);
  c = stop(c, t, 0.30, 0.42, TEAL_MID, MIST);
  c = stop(c, t, 0.42, 0.54, MIST, SAND);
  c = stop(c, t, 0.54, 0.62, SAND, CREAM);
  c = stop(c, t, 0.62, 0.74, CREAM, PEACH);
  c = stop(c, t, 0.74, 0.86, PEACH, CLAY);
  c = stop(c, t, 0.86, 1.00, CLAY, RUST);

  // radial pools, painted bottom → top (teal, mist, cream, rust)
  float d;
  d = length((p - vec2(0.06, 0.04)) / vec2(0.58, 0.50));
  c = mix(c, mix(TEAL_DEEP, TEAL, clamp(d / 0.35, 0.0, 1.0)), ramp(d, 0.0, 1.0, 0.35, 0.85, 0.76));
  d = length((p - vec2(0.30, 0.36)) / vec2(0.64, 0.40));
  c = mix(c, MIST, ramp(d, 0.0, 0.92, 0.42, 0.45, 0.80));
  d = length((p - vec2(0.46, 0.68)) / vec2(0.70, 0.42));
  c = mix(c, CREAM, ramp(d, 0.0, 0.95, 0.38, 0.50, 0.78));
  d = length((p - vec2(0.92, 0.96)) / vec2(0.62, 0.48));
  c = mix(c, RUST, ramp(d, 0.0, 1.0, 0.32, 0.75, 0.72));
  return c;
}

/* ---- water light ---- */
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float ridge(float n, float k){ return pow(1.0 - abs(n * 2.0 - 1.0), k); }
float caustics(vec2 q){
  float t = u_time * 0.045;
  vec2 p = q * 2.6;
  vec2 qq = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  vec2 r  = vec2(fbm(p + 2.0 * qq + vec2(1.7, 9.2) + t * 0.5),
                 fbm(p + 2.0 * qq + vec2(8.3, 2.8) - t * 0.4));
  float c1 = ridge(fbm(p + 2.4 * r), 5.0);
  float c2 = ridge(fbm(p * 2.1 + r * 1.6 - t * 0.9 + vec2(3.1, 7.7)), 7.0);
  return c1 * 0.72 + c2 * 0.42;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;          // y up
  float aspect = u_res.x / u_res.y;
  vec2 q = vec2(uv.x * aspect, uv.y);         // aspect-corrected (vh units)

  /* ---- ripple field: displacement + glint ---- */
  vec2 disp = vec2(0.0);
  float glint = 0.0;
  for (int i = 0; i < MAXR; i++){
    if (i >= u_count) break;
    vec4 r = u_ripples[i];
    float age = u_time - r.z;
    if (age < 0.0 || age > u_fade) continue;
    float life = age / u_fade;
    vec2 dv = q - r.xy;
    float d = sqDist(dv);
    float front = age * u_speed;
    float sigma = u_radius * (0.6 + life * 1.6);
    float w = d - front;
    float env = exp(-(w * w) / (2.0 * sigma * sigma));
    float ph = (w / u_lambda) * 6.2831853;
    float decay = (1.0 - life) * (1.0 - life);
    float amp = r.w * u_strength * env * decay * cos(ph);
    disp += sqNormal(dv) * amp;
    glint += r.w * env * decay * max(0.0, -sin(ph)) * 0.6;
  }

  vec2 qd = q + disp;
  vec2 pCss = vec2(qd.x / aspect, 1.0 - qd.y);   // to CSS coords for the gradient
  vec3 col = brandGradient(pCss);

  /* water light, fading toward the warm bottom */
  float light = caustics(qd);
  float vfade = smoothstep(-0.15, 0.9, uv.y);
  light *= mix(0.55, 1.0, vfade);
  col += light * 0.09;

  /* disturbed water: cool tint + sheen on the shoulders */
  float dm = length(disp) / max(u_strength, 1e-4);
  col = mix(col, MIST, clamp(dm * 0.35, 0.0, 0.35));
  col += vec3(1.0, 0.98, 0.94) * clamp(glint, 0.0, 1.0) * 0.28;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || "shader compile failed");
  }
  return sh;
}

function gradientAngle(w, h) {
  const ratio = w / h;
  if (ratio >= 16 / 9) return 138;
  if (ratio > 1) return 148;
  return 162;
}

export default function WaterBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl =
      canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" }) ||
      canvas.getContext("experimental-webgl", { alpha: false });
    if (!gl) { canvas.hidden = true; return undefined; }
    canvas.hidden = false;

    let program;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (err) {
      console.warn("[WaterBackdrop] disabled:", err.message);
      canvas.hidden = true;
      return undefined;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = (n) => gl.getUniformLocation(program, n);
    const uRes = U("u_res"), uTime = U("u_time"), uAngle = U("u_angle");
    const uRipples = U("u_ripples"), uCount = U("u_count");
    gl.uniform1f(U("u_fade"), RIPPLE.FADE);
    gl.uniform1f(U("u_speed"), RIPPLE.SPEED);
    gl.uniform1f(U("u_radius"), RIPPLE.RADIUS);
    gl.uniform1f(U("u_lambda"), RIPPLE.LAMBDA);
    gl.uniform1f(U("u_strength"), RIPPLE.STRENGTH);
    gl.uniform1f(U("u_shape"), RIPPLE.SHAPE_P);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rippleData = new Float32Array(RIPPLE.MAX * 4);

    let cssW = 1, cssH = 1;
    function resize() {
      cssW = canvas.clientWidth || 1;
      cssH = canvas.clientHeight || 1;
      const w = Math.max(1, Math.round(cssW * RENDER_SCALE));
      const h = Math.max(1, Math.round(cssH * RENDER_SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uAngle, (gradientAngle(cssW, cssH) * Math.PI) / 180);
    }

    /* shader time base == performance.now()/1000 so ripple t0 lines up */
    function draw(t) {
      const list = pruneRipples(t);
      const aspect = cssW / cssH;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        rippleData[i * 4 + 0] = (r.x / cssW) * aspect;   // aspect-corrected uv.x
        rippleData[i * 4 + 1] = 1 - r.y / cssH;          // uv.y (y up)
        rippleData[i * 4 + 2] = r.t0;
        rippleData[i * 4 + 3] = r.strength;
      }
      gl.uniform4fv(uRipples, rippleData);
      gl.uniform1i(uCount, list.length);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let raf = 0, last = 0, running = true;
    const frameGap = 1000 / MAX_FPS;
    function loop(nowMs) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (nowMs - last < frameGap) return;
      last = nowMs;
      draw(nowMs / 1000);
    }
    function startLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; running = true;
      if (reduceMotion.matches) draw(nowSec());
      else raf = requestAnimationFrame(loop);
    }
    function stopLoop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    resize();
    startLoop();

    const onResize = () => { resize(); if (reduceMotion.matches) draw(nowSec()); };
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
    const onMotionPref = () => startLoop();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener?.("change", onMotionPref);

    return () => {
      stopLoop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener?.("change", onMotionPref);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      // no loseContext(): StrictMode re-runs this effect on the same canvas
    };
  }, []);

  return <canvas ref={canvasRef} className="water-canvas" aria-hidden="true" />;
}
