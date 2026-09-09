import React, { useMemo } from "react";
import rippleSvg from "../assets/ripple.svg?raw";

/* ------------------------------------------------------------------
   RippleArt — the official key-visual ripple (展覽KV_ol_F_水波紋_彩色.svg)
   used verbatim. The file is imported as text, its inner markup is
   placed once inside a <symbol>, and every home-screen unit renders it
   with <use>, so all 10 ripples are pixel-identical to the artwork and
   the SVG is parsed only once.
   ------------------------------------------------------------------ */

export const ART_VIEWBOX = "0 0 1035.06 1044.55";
export const ART_W = 1035.06;
export const ART_H = 1044.55;

/* innermost solid ring of the artwork — reused as the shape of the
   outward-travelling "pulse" so it matches the original exactly */
export const INNER_RING_D =
  "M435.07,567.44c1.89,11.33,6,20.14,12,26.12s14.79,10.07,26.12,12c11,2.21,25.81,3.15,44.38,3.15s33.36-.94,44.69-3.15c11-1.89,19.83-6,25.81-12s10.07-14.79,12.27-26.12q2.84-17,2.84-45.32c0-18.57-.95-33.68-2.84-45C598.1,465.78,594,457,588,451s-14.79-10.07-25.81-12.27c-11.33-1.89-26.12-2.84-44.69-2.84s-33.36.95-44.38,2.84C461.82,440.92,453,445,447,451s-10.07,14.79-12,26.12c-2.2,11.33-3.15,26.44-3.15,45C431.92,541,432.87,556.11,435.07,567.44Z";

/* 2nd and 3rd rings of the artwork — lit progressively by the audio level
   while a tour is playing (see DetailSheet's meter) */
export const RING2_D = "M409.13,581.65c2.68,14.86,7.86,26.48,15.72,34.34s19.49,13,34.34,15.72c14.53,2.67,33.93,4.14,58.34,4.14s43.83-1.41,58.75-4.14c14.45-2.64,26.07-7.86,33.93-15.72s13.44-19.41,16.13-34.34,3.73-34.76,3.73-59.58c0-24.41-1-44.31-3.73-59.17s-8.27-26.48-16.13-34.34-19.4-13.47-33.93-16.13c-14.85-2.73-34.34-3.73-58.75-3.73s-43.89,1.08-58.34,3.73c-14.92,2.73-26.48,8.27-34.34,16.13s-13,19.48-15.72,34.34S405,497.66,405,522.07C405,546.89,406.43,566.72,409.13,581.65Z";
export const RING3_D = "M383.18,595.86c3.33,18.41,9.75,32.82,19.49,42.56s24.15,16.11,42.56,19.48c18,3.3,42,5.13,72.3,5.13s54.31-1.74,72.81-5.13c17.91-3.27,32.31-9.74,42-19.48s16.66-24.06,20-42.56S657,552.79,657,522c0-30.25-1.29-54.91-4.61-73.33s-10.26-32.81-20-42.56-24-16.69-42-20c-18.41-3.38-42.56-4.62-72.81-4.62s-54.39,1.34-72.3,4.62c-18.5,3.38-32.82,10.25-42.56,20s-16.16,24.15-19.49,42.56-5.12,43.08-5.12,73.33C378.06,552.79,379.84,577.35,383.18,595.86Z";

/* strip the outer <svg …> … </svg> wrapper, keep <defs><style> + paths */
function innerMarkup(svgText) {
  const open = svgText.indexOf(">", svgText.indexOf("<svg")) + 1;
  const close = svgText.lastIndexOf("</svg>");
  return svgText.slice(open, close);
}

export default function RippleDefs() {
  const html = useMemo(() => innerMarkup(rippleSvg), []);
  return (
    <svg className="ripple-defs" aria-hidden="true" focusable="false">
      <symbol id="kv-ripple" viewBox={ART_VIEWBOX} dangerouslySetInnerHTML={{ __html: html }} />
      {/* soft glow used by the focused unit's inner ring */}
      <filter id="hero-glow" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b1" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b2" />
        <feMerge>
          <feMergeNode in="b1" /><feMergeNode in="b1" /><feMergeNode in="b2" /><feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </svg>
  );
}
