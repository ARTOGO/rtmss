import React, { useCallback, useRef, useState } from "react";
import Backdrop from "./components/Backdrop.jsx";
import HomeScreen from "./components/HomeScreen.jsx";
import DetailSheet from "./components/DetailSheet.jsx";
import { TOURS } from "./data/tours.js";

export default function App() {
  // index of the open tour, or -1 on the plain home screen.
  // The home layer always stays mounted: opening a tour "focuses" its
  // ripple (it floats up and grows) while the glass sheet rises below.
  const [focus, setFocus] = useState(-1);
  // direction of the last prev/next step (+1 next, -1 prev); the home layer
  // reads it to slide the hero out one side and the next one in from the other
  const navRef = useRef({ dir: 0, t: 0 });

  const openTour = useCallback((index) => { navRef.current = { dir: 0, t: performance.now() }; setFocus(index); }, []);
  const closeTour = useCallback(() => setFocus(-1), []);
  const stepTour = useCallback((dir) => {
    navRef.current = { dir, t: performance.now() };
    setFocus((f) => (f < 0 ? f : (f + dir + TOURS.length) % TOURS.length));
  }, []);

  const tour = focus >= 0 ? TOURS[focus] : null;

  return (
    <div id="stage-outer">
      <Backdrop />
      <div id="stage">
        <HomeScreen tours={TOURS} focus={focus} onOpen={openTour} navRef={navRef} />
        <DetailSheet tour={tour} open={focus >= 0} onClose={closeTour} onStep={stepTour} />
      </div>
    </div>
  );
}
