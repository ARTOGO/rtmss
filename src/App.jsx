import React, { useCallback, useState } from "react";
import Backdrop from "./components/Backdrop.jsx";
import HomeScreen from "./components/HomeScreen.jsx";
import DetailSheet from "./components/DetailSheet.jsx";
import { TOURS } from "./data/tours.js";

export default function App() {
  // index of the open tour, or -1 on the plain home screen.
  // The home layer always stays mounted: opening a tour "focuses" its
  // ripple (it floats up and grows) while the glass sheet rises below.
  const [focus, setFocus] = useState(-1);

  const openTour = useCallback((index) => setFocus(index), []);
  const closeTour = useCallback(() => setFocus(-1), []);

  const tour = focus >= 0 ? TOURS[focus] : null;

  return (
    <div id="stage-outer">
      <Backdrop />
      <div id="stage">
        <HomeScreen tours={TOURS} focus={focus} onOpen={openTour} />
        <DetailSheet tour={tour} open={focus >= 0} onClose={closeTour} />
      </div>
    </div>
  );
}
