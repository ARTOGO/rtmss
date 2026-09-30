#!/usr/bin/env node
/* ------------------------------------------------------------------
   把一整包語音導覽素材匯入專案。

   用法：
     npm run import-content -- "素材資料夾的路徑"
     npm run import-content -- "素材資料夾的路徑" --clean     （同時刪掉多餘的舊檔）
     npm run import-content -- "素材資料夾的路徑" --dry       （只試算，不寫入）

   素材資料夾裡放成對的音檔與字幕檔，檔名相同、副檔名不同，例如：
     1-1　變奏山水.mp3   /  1-1　變奏山水.srt
     1-2　意象.mp3       /  1-2　意象.srt
   排序依檔名前面的編號（1-1、1-2 … 2-1 …），也支援 01、02 這種單層編號。
   作品名取自檔名去掉編號的部分。

   這支腳本會做四件事：
     1. 音檔複製成 public/audio/track01.mp3、track02.mp3 …
     2. 字幕轉成 UTF-8（去 BOM、換行統一）後複製成 src/assets/subtitles/track01.srt …
     3. 改寫 src/data/tours.js 裡 WORKS:START / WORKS:END 之間的作品清單
     4. 印出對照表，並提醒缺漏或多餘的檔案
   ------------------------------------------------------------------ */

import { readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const AUDIO_DIR = join(ROOT, "public", "audio");
const SRT_DIR = join(ROOT, "src", "assets", "subtitles");
const TOURS_FILE = join(ROOT, "src", "data", "tours.js");

const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav"];
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const DRY = flags.has("--dry");
const CLEAN = flags.has("--clean");
const srcDir = args.find((a) => !a.startsWith("--"));

const pad = (n) => String(n).padStart(2, "0");
const say = (...a) => console.log(...a);
const warn = (...a) => console.log("  ⚠", ...a);

function die(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

if (!srcDir) {
  die('請指定素材資料夾，例如：\n   npm run import-content -- "J:\\共用雲端硬碟\\...\\聲音文字素材"');
}
if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
  die(`找不到資料夾：${srcDir}`);
}

/* ---- 讀取來源檔案 ---- */
const entries = readdirSync(srcDir).filter((f) => statSync(join(srcDir, f)).isFile());
const audios = entries.filter((f) => AUDIO_EXT.includes(extname(f).toLowerCase()));
const srts = entries.filter((f) => extname(f).toLowerCase() === ".srt");

if (!audios.length) die(`資料夾裡找不到音檔（${AUDIO_EXT.join(" / ")}）：${srcDir}`);

/* ---- 依檔名編號排序：支援 1-1 / 1_1 / 01 / 1. 等寫法 ---- */
function orderKey(name) {
  const two = name.match(/^\s*(\d+)\s*[-–—_.]\s*(\d+)/);
  if (two) return [Number(two[1]), Number(two[2])];
  const one = name.match(/^\s*(\d+)/);
  if (one) return [0, Number(one[1])];
  return [9999, 9999];
}
function byOrder(a, b) {
  const ka = orderKey(a), kb = orderKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || a.localeCompare(b, "zh-Hant");
}

/* ---- 字幕編碼偵測 ----
   交付來的 srt 不一定是 UTF-8：字幕軟體常輸出 UTF-16（Windows 記事本的
   「Unicode」），繁中環境也可能是 Big5。讀錯編碼會整份變亂碼，所以先判斷再轉。 */
function decodeSrt(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return { text: buf.toString("utf16le", 2), enc: "UTF-16LE" };
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const be = Buffer.from(buf.subarray(2, buf.length - ((buf.length - 2) % 2)));
    be.swap16();
    return { text: be.toString("utf16le"), enc: "UTF-16BE" };
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { text: buf.toString("utf8", 3), enc: "UTF-8" };
  // UTF-16 沒有 BOM 時，前段會出現大量 0x00
  const head = buf.subarray(0, Math.min(buf.length, 512));
  let nul = 0;
  for (const b of head) if (b === 0) nul++;
  if (nul > head.length * 0.2) return { text: buf.toString("utf16le"), enc: "UTF-16LE" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), enc: "UTF-8" }; }
  catch (_) {
    try { return { text: new TextDecoder("big5").decode(buf), enc: "Big5" }; }
    catch (_) { return { text: buf.toString("utf8"), enc: "UTF-8?" }; }
  }
}

/* ---- 從檔名取作品名：去掉開頭編號與分隔符號 ---- */
function titleOf(file) {
  return basename(file, extname(file))
    .replace(/^\s*\d+\s*[-–—_.]\s*\d+\s*/, "")
    .replace(/^\s*\d+\s*[-–—_.\s]\s*/, "")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

audios.sort(byOrder);

/* ---- 配對字幕：先找同名，再找同編號 ---- */
const srtByBase = new Map(srts.map((f) => [basename(f, extname(f)), f]));
const srtByNum = new Map();
for (const f of srts) {
  const k = orderKey(f).join("-");
  if (!srtByNum.has(k)) srtByNum.set(k, f);
}

const works = audios.map((audio, i) => {
  const base = basename(audio, extname(audio));
  const srt = srtByBase.get(base) || srtByNum.get(orderKey(audio).join("-")) || null;
  let enc = null, bad = false;
  if (srt) {
    const d = decodeSrt(readFileSync(join(srcDir, srt)));
    enc = d.enc;
    bad = d.text.includes("\uFFFD");
  }
  return { n: i + 1, title: titleOf(audio), audio, srt, enc, bad, ext: extname(audio).toLowerCase() };
});

/* ---- 印出對照表 ---- */
say(`\n來源：${srcDir}`);
say(`找到 ${audios.length} 個音檔、${srts.length} 個字幕檔${DRY ? "（--dry：只試算，不寫入）" : ""}\n`);
for (const w of works) {
  say(`  ${pad(w.n)}  ${w.title || "(無法解析，請手動填)"}   ←  ${w.audio}   字幕:${w.srt ? (w.enc === "UTF-8" ? "有" : "有 (" + w.enc + " → UTF-8)") : "缺"}${w.bad ? "  ⚠ 有無法解碼的字元" : ""}`);
}
say("");

const missing = works.filter((w) => !w.srt);
if (missing.length) warn(`有 ${missing.length} 件沒有字幕檔，這些作品可以播放但不會顯示字幕：${missing.map((w) => pad(w.n)).join("、")}`);
const noTitle = works.filter((w) => !w.title);
if (noTitle.length) warn(`有 ${noTitle.length} 件無法從檔名解析作品名，匯入後請手動修改 src/data/tours.js 的 WORKS`);
const garbled = works.filter((w) => w.bad);
if (garbled.length) warn(`有 ${garbled.length} 個字幕檔含無法解碼的字元，請確認來源編碼：${garbled.map((w) => pad(w.n)).join("、")}`);
const odd = works.filter((w) => w.ext !== ".mp3");
if (odd.length) warn(`有 ${odd.length} 件不是 mp3，會沿用原副檔名並寫進 WORKS；iPad Safari 可播 mp3 與 m4a，wav 檔案很大不建議`);

if (DRY) { say("\n--dry：沒有寫入任何檔案。確認上表無誤後，拿掉 --dry 再跑一次。\n"); process.exit(0); }

/* ---- 寫入檔案 ---- */
mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(SRT_DIR, { recursive: true });

for (const w of works) {
  const nn = pad(w.n);
  copyFileSync(join(srcDir, w.audio), join(AUDIO_DIR, `track${nn}${w.ext}`));
  if (w.srt) {
    const text = decodeSrt(readFileSync(join(srcDir, w.srt))).text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    writeFileSync(join(SRT_DIR, `track${nn}.srt`), text, "utf8");
  }
}
say(`✔ 已複製 ${works.length} 個音檔到 public/audio/`);
say(`✔ 已複製 ${works.filter((w) => w.srt).length} 個字幕檔到 src/assets/subtitles/`);

/* ---- 改寫 tours.js 的 WORKS 區塊 ---- */
const lines = works.map((w) => {
  const title = JSON.stringify(w.title || `作品${pad(w.n)}`);
  return w.ext === ".mp3"
    ? `  ${title}`
    : `  { title: ${title}, audio: "track${pad(w.n)}${w.ext}" }`;
});
const block = `export const WORKS = [\n${lines.join(",\n")}\n];`;

let tours = readFileSync(TOURS_FILE, "utf8");
const START = "/* WORKS:START", END = "/* WORKS:END */";
const si = tours.indexOf(START), ei = tours.indexOf(END);
if (si < 0 || ei < 0) {
  die(`在 ${TOURS_FILE} 找不到 WORKS:START / WORKS:END 標記，請手動更新 WORKS 清單。`);
}
const startLineEnd = tours.indexOf("\n", si) + 1;
tours = tours.slice(0, startLineEnd) + block + "\n" + tours.slice(ei);
writeFileSync(TOURS_FILE, tours, "utf8");
say(`✔ 已更新 src/data/tours.js 的作品清單（${works.length} 件）`);

/* ---- 多餘的舊檔 ---- */
const keepAudio = new Set(works.map((w) => `track${pad(w.n)}${w.ext}`));
const keepSrt = new Set(works.filter((w) => w.srt).map((w) => `track${pad(w.n)}.srt`));
const staleAudio = readdirSync(AUDIO_DIR).filter((f) => !keepAudio.has(f));
const staleSrt = readdirSync(SRT_DIR).filter((f) => !keepSrt.has(f));

if (staleAudio.length || staleSrt.length) {
  if (CLEAN) {
    staleAudio.forEach((f) => unlinkSync(join(AUDIO_DIR, f)));
    staleSrt.forEach((f) => unlinkSync(join(SRT_DIR, f)));
    say(`✔ 已刪除 ${staleAudio.length + staleSrt.length} 個多餘的舊檔（--clean）`);
  } else {
    warn(`還有上一批留下的多餘檔案，會被打包但不會被使用：${[...staleAudio, ...staleSrt].join("、")}`);
    warn("確定不需要的話，重跑一次並加上 --clean 即可刪除。");
  }
}

say("\n下一步：");
say("  npm run dev      在本機檢查作品名、字幕、播放是否正確（http://127.0.0.1:5173）");
say("  npm run build    確認可以建置");
say("  git add -A && git commit -m \"Update guide content\" && git push");
say("  推上 main 後 GitHub Actions 會自動部署，幾分鐘後 https://artogo.github.io/rtmss/ 生效\n");
