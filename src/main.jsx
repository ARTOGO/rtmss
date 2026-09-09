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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
