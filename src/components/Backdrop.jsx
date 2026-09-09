import React from "react";
import WaterBackdrop from "./WaterBackdrop.jsx";

/* Full-viewport backdrop. WaterBackdrop draws gradient + water-light +
   ripple distortion in WebGL; the CSS gradient on #stage-outer is the
   still fallback underneath. */
export default function Backdrop() {
  return (
    <>
      <WaterBackdrop />
      <div className="vignette" aria-hidden="true" />
    </>
  );
}
