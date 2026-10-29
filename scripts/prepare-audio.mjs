#!/usr/bin/env node
/* ------------------------------------------------------------------
   prepare-audio — 把 public/audio/ 的音檔整理成展場用的規格，並算出
   播放時圈圈發光要用的音量曲線。

     node scripts/prepare-audio.mjs              重壓 + 產生音量曲線
     node scripts/prepare-audio.mjs --levels-only  只重算音量曲線
     node scripts/prepare-audio.mjs --bitrate 96k  換一個位元率

   為什麼要重壓：
     導覽是單純人聲，但原始檔是 192–256 kbps 立體聲，檔案大一倍以上，
     iPad 解碼與緩衝的負擔也跟著變大。單聲道 80 kbps 人聲聽感幾乎沒差。

   為什麼要音量曲線：
     圈圈的亮度要跟著聲音起伏。以前是播放時即時分析音訊，但那會把聲音
     繞進 Web Audio，iPad 一忙就斷音。改成在這裡先算好，播放時照時間
     查表，畫面一樣但聲音走回系統原本的播放路徑。

   需要 ffmpeg。Windows 沒有的話：winget install Gyan.FFmpeg
   ------------------------------------------------------------------ */

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, renameSync, statSync, existsSync, unlinkSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = join(ROOT, "public", "audio");
const LEVELS_FILE = join(ROOT, "src", "data", "levels.js");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const BITRATE = opt("--bitrate", "80k");
const LEVELS_ONLY = has("--levels-only");

/* 音量曲線的取樣率：每秒 20 點，跟原本分析器的更新率一致 */
const HZ = 20;
/* 只看人聲頻段，和原本那四段加權的效果接近 */
const BAND = { low: 90, high: 3000 };
const SR = 8000;                       // 取樣率；頻段上限 3kHz，8kHz 綽綽有餘
const WINDOW = SR / HZ;                // 每格的樣本數

const say = (s) => console.log(s);
const warn = (s) => console.warn(`\x1b[33m${s}\x1b[0m`);
const die = (s) => { console.error(`\x1b[31m${s}\x1b[0m`); process.exit(1); };

/* ---- 找 ffmpeg ---- */
function findFfmpeg() {
  const candidates = ["ffmpeg"];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const wg = join(local, "Microsoft", "WinGet", "Packages");
    try {
      for (const d of readdirSync(wg)) {
        if (!d.startsWith("Gyan.FFmpeg")) continue;
        for (const b of readdirSync(join(wg, d))) {
          const p = join(wg, d, b, "bin", "ffmpeg.exe");
          if (existsSync(p)) candidates.push(p);
        }
      }
    } catch (_) { /* 沒裝 winget 或沒這個資料夾 */ }
  }
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { stdio: "ignore" });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  die("找不到 ffmpeg。Windows 請先執行：winget install Gyan.FFmpeg（裝完要重開終端機）");
}

/* ---- 掃描音檔 ---- */
const files = readdirSync(AUDIO_DIR)
  .filter((f) => /^track\d+\.(mp3|m4a|aac)$/i.test(f))
  .sort();
if (!files.length) die(`public/audio/ 裡沒有 track01.mp3 之類的音檔`);

const probe = (file) => {
  const out = execFileSync(FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe")), [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=channels,sample_rate,bit_rate",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=0", file
  ], { encoding: "utf8" });
  const get = (k) => { const m = out.match(new RegExp(`^${k}=(.*)$`, "m")); return m ? m[1] : ""; };
  return {
    channels: +get("channels") || 0,
    rate: +get("sample_rate") || 0,
    kbps: Math.round((+get("bit_rate") || 0) / 1000),
    seconds: +get("duration") || 0
  };
};

const mb = (p) => statSync(p).size / 1048576;
const targetKbps = Math.round(parseFloat(BITRATE) * (/k$/i.test(BITRATE) ? 1 : 0.001));

/* ---- 1. 重壓成單聲道 ---- */
if (!LEVELS_ONLY) {
  say(`\n重壓成單聲道 ${BITRATE}（ffmpeg: ${FFMPEG === "ffmpeg" ? "PATH" : FFMPEG}）\n`);
  let before = 0, after = 0;
  for (const f of files) {
    const src = join(AUDIO_DIR, f);
    const info = probe(src);
    before += mb(src);
    // 已經是單聲道而且位元率沒有比目標高，就不要再壓一次（重壓會再掉一次品質）
    if (info.channels === 1 && info.kbps && info.kbps <= targetKbps + 8) {
      after += mb(src);
      say(`  ${f.padEnd(14)} 已是單聲道 ${info.kbps} kbps，略過`);
      continue;
    }
    const tmp = join(AUDIO_DIR, `.tmp-${f}`);
    execFileSync(FFMPEG, [
      "-v", "error", "-y", "-i", src,
      "-ac", "1", "-ar", "44100",
      "-c:a", "libmp3lame", "-b:a", BITRATE,
      "-map_metadata", "-1",
      tmp
    ]);
    const sizeBefore = mb(src), sizeAfter = mb(tmp);
    renameSync(tmp, src);
    after += sizeAfter;
    say(`  ${f.padEnd(14)} ${info.channels === 1 ? "單" : "立體"}聲道 ${info.kbps} kbps  ${sizeBefore.toFixed(1)} MB  →  單聲道 ${targetKbps} kbps  ${sizeAfter.toFixed(1)} MB`);
  }
  say(`\n  合計 ${before.toFixed(1)} MB → ${after.toFixed(1)} MB（少 ${(100 - after / before * 100).toFixed(0)}%）\n`);
}

/* ---- 2. 算音量曲線 ---- */
say(`算音量曲線（每秒 ${HZ} 點，${BAND.low}–${BAND.high} Hz 人聲頻段）\n`);

function envelopeOf(file) {
  // 解成單聲道 8kHz 的原始 16-bit 樣本，直接在記憶體裡算 RMS
  const pcm = execFileSync(FFMPEG, [
    "-v", "error", "-i", file,
    "-af", `highpass=f=${BAND.low},lowpass=f=${BAND.high}`,
    "-ac", "1", "-ar", String(SR),
    "-f", "s16le", "-"
  ], { encoding: "buffer", maxBuffer: 1 << 30 });

  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const n = Math.ceil(samples.length / WINDOW);
  const rms = new Float64Array(n);
  for (let w = 0; w < n; w++) {
    const start = w * WINDOW;
    const end = Math.min(samples.length, start + WINDOW);
    let sum = 0;
    for (let i = start; i < end; i++) { const v = samples[i] / 32768; sum += v * v; }
    rms[w] = end > start ? Math.sqrt(sum / (end - start)) : 0;
  }

  // 每首各自正規化：取說話段落的 95 百分位當作「響」，對應到 0.82，
  // 這樣錄音音量不同的訪談，圈圈的亮度範圍才會一致
  const voiced = [...rms].filter((v) => v > 0.004).sort((a, b) => a - b);
  const p95 = voiced.length ? voiced[Math.floor(voiced.length * 0.95)] : 1;
  const scale = p95 > 0 ? 0.82 / p95 : 1;

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(rms[i] * scale * 255)));
  return out;
}

const entries = [];
for (const f of files) {
  const src = join(AUDIO_DIR, f);
  const id = parseInt(f.match(/\d+/)[0], 10);
  const env = envelopeOf(src);
  entries.push([id, Buffer.from(env).toString("base64")]);
  say(`  ${f.padEnd(14)} ${(env.length / HZ / 60).toFixed(1)} 分鐘 → ${env.length} 點（${(env.length / 1024).toFixed(1)} KB）`);
}

const total = entries.reduce((s, [, b64]) => s + b64.length, 0);
say(`\n  曲線資料共 ${(total / 1024).toFixed(0)} KB（會內嵌進 index.html）\n`);

const body = `/* 由 scripts/prepare-audio.mjs 產生 — 不要手改。
   音檔換掉之後請重跑：npm run prepare-audio

   每一首存一條音量曲線：每秒 ${HZ} 點，每點 0–255。播放時 DetailSheet
   照 currentTime 查表，決定中央圈圈要亮多少。這樣就不必在播放時即時
   分析音訊（那會把聲音繞進 Web Audio，iPad 上會斷音）。 */

export const LEVEL_HZ = ${HZ};

const B64 = {
${entries.map(([id, b64]) => `  ${id}: "${b64}"`).join(",\n")}
};

const cache = {};

/* 第一次播到某一首時才解碼那一首（約 ${(total / entries.length / 1024).toFixed(0)} KB） */
export function levelsFor(id) {
  if (cache[id]) return cache[id];
  const b64 = B64[id];
  if (!b64) return (cache[id] = new Uint8Array(0));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return (cache[id] = out);
}
`;

writeFileSync(LEVELS_FILE, body, "utf8");
say(`✔ 已寫入 src/data/levels.js\n`);
