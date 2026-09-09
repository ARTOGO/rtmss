/* Minimal SRT parser → [{ start, end, text }] (seconds). Tolerates a BOM,
   CRLF, missing indices and multi-line cue text (joined with a space). */

function toSec(ts) {
  const m = ts.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
}

export function parseSrt(text) {
  if (!text) return [];
  const blocks = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const textLines = lines.slice(ti + 1);
    if (!textLines.length) continue;
    cues.push({ start: toSec(a), end: toSec(b), text: textLines.join(" ") });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/* index of the cue active at time t, or the last cue already passed
   (so the subtitle line does not blink empty between cues); -1 before the first */
export function cueIndexAt(cues, t) {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start <= t) idx = i; else break;
  }
  return idx;
}
