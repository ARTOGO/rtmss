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
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const msg = e.data || {};
    if (msg.type !== "SW_READY") return;
    if (msg.updated) {
      // a newer build just took over: reload when nothing is playing
      const busy = document.querySelector(".sheet.open");
      if (!busy) location.reload(); else toast("已下載新版本，回到首頁後會自動更新");
    } else {
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
  const apply = () => {
    const vv = window.visualViewport;
    const h = Math.round(vv ? vv.height : window.innerHeight);
    const w = Math.round(vv ? vv.width : window.innerWidth);
    if (h > 0 && w > 0) {
      root.style.setProperty("--app-h", h + "px");
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
