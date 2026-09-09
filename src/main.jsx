import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

/* ------------------------------------------------------------------
   Offline install. sw.js (generated at build time, see vite.config.js)
   downloads every file of the build into a cache on first load; from
   then on the guide works with no network. The worker tells us when it
   is ready so exhibition staff can see the install finished.
   ------------------------------------------------------------------ */
function toast(text) {
  const el = document.createElement("div");
  el.className = "pwa-toast";
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 600); }, 4500);
}
const standalone = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
  window.navigator.standalone === true;

if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const msg = e.data || {};
    if (msg.type !== "SW_READY") return;
    if (msg.updated) {
      // a newer build just took over: reload when nothing is playing
      const busy = document.querySelector(".sheet.open");
      if (!busy) location.reload(); else if (!standalone()) toast("已下載新版本，回到首頁後會自動更新");
    } else if (!standalone()) {
      // installed app: visitors should never see setup messages
      toast("已完成離線安裝，沒有網路也能使用");
    }
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((reg) => {
      // every start: make sure nothing fell out of the cache
      if (reg.active) reg.active.postMessage({ type: "CHECK" });
    }).catch((err) => {
      console.warn("[offline] service worker registration failed:", err);
    });
  });
}

/* ------------------------------------------------------------------
   Viewport sizing. iPadOS home-screen web apps keep a stale layout
   viewport after rotation (fixed layers end up short, leaving a band at
   the bottom and shifting content up). We size the stage from the visual
   viewport instead and re-measure a few times after every rotation.
   ------------------------------------------------------------------ */
(function installViewportFix() {
  const root = document.documentElement;

  /* env() can't be read back from a custom property everywhere, so measure the
     bottom safe area with a hidden probe (it changes on rotation) */
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;width:0;pointer-events:none;visibility:hidden;" +
    "height:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);

  const apply = () => {
    // take the largest height any API reports: in standalone mode some of
    // them exclude the bottom safe area (home indicator), which left a band
    const vv = window.visualViewport;
    const h = Math.round(Math.max(window.innerHeight || 0, vv ? vv.height : 0, document.documentElement.clientHeight || 0));
    const w = Math.round(Math.max(window.innerWidth || 0, vv ? vv.width : 0, document.documentElement.clientWidth || 0));
    /* iOS home-screen apps: the layout viewport can be shorter than the window,
       which leaves a strip of bare page background under everything (the band
       reported on iPhone: window 812 vs screen 874, bottom inset 34). Grow the
       stage by at most that inset, and only when the screen really is taller —
       so devices without the problem (iPad: window 820 = screen 820) are left
       exactly as they are. */
    const sc = window.screen || {};
    const scMin = Math.min(sc.width || 0, sc.height || 0);
    const scMax = Math.max(sc.width || 0, sc.height || 0);
    const screenH = w > h ? scMin : scMax;
    const inset = Math.round(probe.getBoundingClientRect().height || 0);
    const extra = Math.max(0, Math.min(screenH - h, inset));
    root.style.setProperty("--sab-px", inset + "px");

    if (h > 0 && w > 0) {
      root.style.setProperty("--app-h", (h + extra) + "px");
      root.style.setProperty("--app-w", w + "px");
    }
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    window.dispatchEvent(new Event("rtmss:viewport"));
  };
  const settle = () => { apply(); [120, 400, 1000].forEach((ms) => setTimeout(apply, ms)); };
  window.addEventListener("resize", settle);
  window.addEventListener("orientationchange", settle);
  window.addEventListener("pageshow", settle);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", apply);
  settle();
})();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
