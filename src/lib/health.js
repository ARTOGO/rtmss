/* ------------------------------------------------------------------
   health — 展場現場自己看的效能紀錄。

   iPad 沒有工作管理員，也看不到 CPU 或溫度；要量網頁效能得接 Mac 開
   Safari 網頁檢閱器。展場沒有 Mac，所以 App 自己記。

   成本為零：數字是從本來就在跑的水波紋動畫迴圈順手記下來的，沒有額外
   的計時器或迴圈。待機時動畫停了，這裡也跟著停，不會留下假的卡頓。

   數字顯示在長按首頁標題才會出現的那張卡片裡，觀眾看不到。
   ------------------------------------------------------------------ */

/* 一幀超過這個毫秒數就算「明顯卡了一下」。動畫本來就限制在 30fps
   （約 33ms），所以門檻要拉得比它高，正常運作不會被算進去。 */
const HITCH_MS = 150;

export const health = {
  startedAt: Date.now(),   // App 這次連續運行的起點
  worstFrameMs: 0,         // 自啟動以來最久的一次停頓
  hitches: 0,              // 超過 HITCH_MS 的次數
  frames: 0                // 累計畫格數，拿來看平均
};

/* 開 App 的頭幾秒要解開程式、產生水波紋圖、算版面，停頓幾百毫秒是正常的。
   那個數字跟「展場跑了一下午開始過熱」是兩回事，混在一起看反而失去意義。 */
const SETTLE_MS = 3000;

export function noteFrame(gapMs) {
  // 從待機恢復、或分頁切回來的第一幀間隔很長，但那不是卡頓
  if (!(gapMs > 0) || gapMs > 3000) return;
  health.frames++;
  if (performance.now() < SETTLE_MS) return;   // 啟動成本不列入
  if (gapMs > health.worstFrameMs) health.worstFrameMs = gapMs;
  if (gapMs > HITCH_MS) health.hitches++;
}

export function resetHealth() {
  health.startedAt = Date.now();
  health.worstFrameMs = 0;
  health.hitches = 0;
  health.frames = 0;
}
