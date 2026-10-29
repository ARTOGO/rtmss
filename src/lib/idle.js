/* ------------------------------------------------------------------
   idle — 展場待機判斷。

   iPad 整天開著，但大部分時間沒有觀眾。沒人用的時候把首頁的水波紋動畫
   整個停掉（不是放慢，是完全不跑），持續的 CPU/GPU 負擔歸零，機器比較
   不會熱。木箱裡沒有散熱，過熱會同時造成播放卡頓，以及 iOS 限制充電、
   變成耗電比充電快。

   「有人在用」= 最近 IDLE_AFTER 秒內碰過畫面，或正在播放語音。
   任何觸碰都會立刻喚醒，觀眾不會察覺。

   注意：這不會把畫面變暗。網頁動不了 iPad 的背光，而這台是 LCD，
   蓋一層黑色不會省電——真正省電的是調低系統亮度和木箱通風。
   ------------------------------------------------------------------ */

/* 幾秒沒人碰就進入待機。要更早/更晚只要改這個數字。 */
const IDLE_AFTER = 120;

let idle = false;
let busy = false;          // 語音播放中：即使沒人碰也算有人在用
let timer = 0;
const subs = new Set();

function set(next) {
  if (next === idle) return;
  idle = next;
  for (const fn of subs) { try { fn(idle); } catch (_) { /* 一個訂閱壞掉不要拖垮其他的 */ } }
}

function arm() {
  clearTimeout(timer);
  if (busy) return;
  timer = window.setTimeout(() => set(true), IDLE_AFTER * 1000);
}

/* 有人碰了畫面 */
export function poke() { set(false); arm(); }

/* 播放狀態改變時由 DetailSheet 呼叫 */
export function setBusy(v) {
  if (busy === v) return;
  busy = v;
  if (v) { clearTimeout(timer); set(false); } else arm();
}

export function isIdle() { return idle; }

export function onIdleChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

if (typeof window !== "undefined") {
  // capture 階段：動畫要在這個觸碰被當成點擊或拖曳處理之前就先恢復
  for (const ev of ["pointerdown", "pointerup", "touchstart", "keydown"]) {
    window.addEventListener(ev, poke, { capture: true, passive: true });
  }
  window.addEventListener("rtmss:viewport", poke);   // 轉向也算有人在動它
  arm();
}
