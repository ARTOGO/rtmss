/* ============================================================
   導覽內容設定 — 更換正式素材時，這個檔案是唯一需要編輯的地方。
   完整交接說明請看專案根目錄的 CONTENT-UPDATE.md。

   檔案對應規則（依編號自動對應，不需要手動寫路徑）：
     第 1 件 → public/audio/track01.mp3  ＋ src/assets/subtitles/track01.srt
     第 2 件 → public/audio/track02.mp3  ＋ src/assets/subtitles/track02.srt
     …以此類推，編號永遠是兩位數。

   只要把檔案放進那兩個資料夾、並把作品名依相同順序填進下面的 WORKS，
   首頁的水波紋數量、內頁的標題與字幕就會全部跟著改變。
   ============================================================ */

/* ---- 作品清單：順序＝首頁編號順序（第一個就是 01） ----
   每一項通常只要寫作品名字串即可。
   音檔不是 mp3 時，改寫成物件指定檔名：{ title: "作品名", audio: "track01.m4a" } */
/* WORKS:START — 可手動編輯，也可由 `npm run import-content` 自動產生 */
export const WORKS = [
  "從水開始",
  "庄頭的守護者",
  "保存的劉氏建築群",
  "從安置到移動",
  "都市重新規劃",
  "中山里 潘威志里長訪談",
  "斯馨祠 林文雄主委訪談",
  "劉氏宗親會 劉進興秘書長訪談",
  "大豐國小 姜孟佑校長訪談",
  "文史工作者 簡政展老師訪談"
];
/* WORKS:END */

/* ---- 以下為自動組裝，正常情況不需要修改 ---------------- */

/* 所有字幕檔一次讀進來（建置時內嵌進 index.html，離線可用）。
   新增 srt 檔不需要加 import，放進資料夾即可被抓到。 */
const SUBTITLES = import.meta.glob("../assets/subtitles/*.srt", {
  eager: true,
  query: "?raw",
  import: "default"
});

const pad = (n) => String(n).padStart(2, "0");
const srtFor = (nn) => SUBTITLES[`../assets/subtitles/track${nn}.srt`] ?? null;

export const TOURS = WORKS.map((w, i) => {
  const id = i + 1;
  const nn = pad(id);
  const title = typeof w === "string" ? w : w.title;
  const audio = typeof w === "string" ? null : w.audio;
  return {
    id,
    title,
    audioSrc: `audio/${audio || `track${nn}.mp3`}`,
    srt: srtFor(nn)          // 沒有對應 srt 時為 null：仍可播放，只是沒有字幕
  };
});

/* ============================================================
   版面位置 — 每件作品水波紋的中心座標（cx / cy，整個視窗的百分比）。
   順序對應 WORKS。作品數量多於下面的座標時，會自動補上分散的位置，
   所以新增作品不會壞掉；想要精準構圖時再手動補座標即可。

   size 是「呼吸到最大時」的直徑（相對視窗短邊的百分比），統一使用 UNIT_SIZE，
   實際大小由物理模擬在 0.6~1.2 倍之間呼吸。物理模擬會把每顆整張水波紋圖
   保持在畫面內（標題下緣到底部說明文字上緣之間），所以座標不必算得很精準。
   ============================================================ */
export const UNIT_SIZE = 26;

export const BASE_LAYOUT = [
  { cx: 48.0, cy: 64.0 }, // 01
  { cx: 74.0, cy: 18.0 }, // 02
  { cx: 78.0, cy: 45.0 }, // 03
  { cx: 76.0, cy: 84.0 }, // 04
  { cx: 50.0, cy: 37.0 }, // 05
  { cx: 79.0, cy: 66.0 }, // 06
  { cx: 23.0, cy: 27.0 }, // 07
  { cx: 22.0, cy: 52.0 }, // 08
  { cx: 55.0, cy: 85.0 }, // 09
  { cx: 26.0, cy: 80.0 }  // 10
];

/* 超出 BASE_LAYOUT 的作品：用黃金角散佈在安全範圍內，物理模擬會再把它們推開 */
function scatter(i) {
  const g = 0.6180339887498949;
  return {
    cx: +(14 + ((i * g * 100) % 72)).toFixed(1),
    cy: +(18 + (((i * g * 2 + 0.37) * 100) % 66)).toFixed(1)
  };
}

export const LAYOUT = TOURS.map((_, i) => {
  const p = BASE_LAYOUT[i] || scatter(i);
  return { cx: p.cx, cy: p.cy, size: UNIT_SIZE };
});

/* 開發模式下提醒缺漏的素材（正式版不會輸出） */
if (import.meta.env.DEV) {
  TOURS.forEach((t) => {
    if (!t.srt) console.warn(`[內容檢查] 第 ${pad(t.id)} 件「${t.title}」找不到字幕檔 src/assets/subtitles/track${pad(t.id)}.srt`);
  });
  const extra = Object.keys(SUBTITLES).length - TOURS.length;
  if (extra > 0) console.warn(`[內容檢查] subtitles 資料夾多出 ${extra} 個 srt 檔，超過 WORKS 的作品數，這些不會被使用`);
}

/* 內頁開啟時，被點的那顆水波紋停在面板上方的哪裡（sheetFrac 是面板佔的高度比例）；
   scale 是最大倍率，橫式等較矮的畫面會自動縮小以免被裁切 */
export const HERO = { x: 0.5, sheetFrac: 0.41, scale: 1.55 };
