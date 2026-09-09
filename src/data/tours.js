/* ============================================================
   資料設定區 — 導覽內容
   每一則：id、title（作品名）、audioSrc（音檔，放在 public/audio/）、
   srt（字幕檔文字，放在 src/assets/subtitles/ 以 ?raw 匯入，建置時內嵌）。
   沒有 srt 的作品可改給 transcript: ["段落…"]，面板會顯示文字但不同步。

   01~10 對應「聲音文字素材」資料夾的十組 mp3 + srt（1-1 … 2-5）。
   ============================================================ */
import srt01 from "../assets/subtitles/track01.srt?raw";
import srt02 from "../assets/subtitles/track02.srt?raw";
import srt03 from "../assets/subtitles/track03.srt?raw";
import srt04 from "../assets/subtitles/track04.srt?raw";
import srt05 from "../assets/subtitles/track05.srt?raw";
import srt06 from "../assets/subtitles/track06.srt?raw";
import srt07 from "../assets/subtitles/track07.srt?raw";
import srt08 from "../assets/subtitles/track08.srt?raw";
import srt09 from "../assets/subtitles/track09.srt?raw";
import srt10 from "../assets/subtitles/track10.srt?raw";

export const TOURS = [
  { id: 1,  title: "變奏山水",             audioSrc: "audio/track01.mp3", srt: srt01 },
  { id: 2,  title: "意象",                 audioSrc: "audio/track02.mp3", srt: srt02 },
  { id: 3,  title: "悠閒．茶盤茶具組",     audioSrc: "audio/track03.mp3", srt: srt03 },
  { id: 4,  title: "誰來唱我們的歌",       audioSrc: "audio/track04.mp3", srt: srt04 },
  { id: 5,  title: "夏雪",                 audioSrc: "audio/track05.mp3", srt: srt05 },
  { id: 6,  title: "以植代塑",             audioSrc: "audio/track06.mp3", srt: srt06 },
  { id: 7,  title: "點廢成金",             audioSrc: "audio/track07.mp3", srt: srt07 },
  { id: 8,  title: "方寸循環",             audioSrc: "audio/track08.mp3", srt: srt08 },
  { id: 9,  title: "神來之筆",             audioSrc: "audio/track09.mp3", srt: srt09 },
  { id: 10, title: "城市礦產的無毒工藝再生", audioSrc: "audio/track10.mp3", srt: srt10 }
];

/* ============================================================
   版面位置設定 — 10 個水波紋的中心座標 (cx / cy，整個視窗的百分比)，順序對應 TOURS。
   size 是「呼吸到最大 (1.0) 時」的直徑，相對視窗短邊 (vmin) 的百分比；
   所有單元統一使用 UNIT_SIZE，實際大小由物理模擬在 0.5~1.0 倍之間呼吸。

   物理模擬會確保每顆「整張水波紋圖」都留在畫面內：太靠邊的座標會被自動內縮，
   飄動、推擠、拖曳也都不會超出邊界。
   ============================================================ */
export const UNIT_SIZE = 26;

export const LAYOUT = [
  { cx: 48.0, cy: 64.0, size: UNIT_SIZE }, // 01
  { cx: 74.0, cy: 18.0, size: UNIT_SIZE }, // 02
  { cx: 78.0, cy: 45.0, size: UNIT_SIZE }, // 03
  { cx: 76.0, cy: 84.0, size: UNIT_SIZE }, // 04
  { cx: 50.0, cy: 37.0, size: UNIT_SIZE }, // 05
  { cx: 79.0, cy: 66.0, size: UNIT_SIZE }, // 06
  { cx: 23.0, cy: 27.0, size: UNIT_SIZE }, // 07
  { cx: 22.0, cy: 52.0, size: UNIT_SIZE }, // 08
  { cx: 55.0, cy: 85.0, size: UNIT_SIZE }, // 09
  { cx: 26.0, cy: 80.0, size: UNIT_SIZE }  // 10
];

/* where the focused unit floats while its sheet is open (viewport fractions) */
export const HERO = { x: 0.5, y: 0.29, scale: 1.55 };
