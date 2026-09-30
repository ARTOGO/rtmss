import React from "react";
import WaterBackdrop from "./WaterBackdrop.jsx";

/* ------------------------------------------------------------------
   Full-viewport backdrop.

   WATER_EFFECT = true mounts the WebGL water (brand gradient + moving
   water-light + ripple distortion). It is a full-screen fragment shader
   running continuously, which is by far the heaviest thing in the app:
   phones ran hot in the field, so it is OFF for the exhibition build.

   With it off the page shows the identical brand gradient painted in
   CSS (#stage-outer in styles.css) — same colours, no per-frame GPU
   work. Set this to true to bring the moving water back.
   ------------------------------------------------------------------ */
const WATER_EFFECT = false;

export default function Backdrop() {
  return (
    <>
      {WATER_EFFECT && <WaterBackdrop />}
      <div className="vignette" aria-hidden="true" />
    </>
  );
}
