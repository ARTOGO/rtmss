import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSrt, cueIndexAt } from "../lib/srt.js";

/* ------------------------------------------------------------------
   DetailSheet — the frosted "liquid glass" sheet that rises from the
   bottom when a tour is opened. The focused ripple keeps floating in
   the home layer above it (see useUnitPhysics focus mode).

   Collapsed: number + title, the subtitle line currently being spoken
   (from the tour's .srt), progress bar, −15 / play-pause / +15, chevron.
   Expanded (chevron or pull up): the subtitle line becomes the full
   transcript, current cue highlighted and kept in view.

   Audio starts automatically when the sheet opens (the tap that opened
   it counts as the user gesture). The waveform glyph is driven by a
   Web Audio AnalyserNode reading the real signal; if the analyser can't
   see the stream (e.g. some file:// setups) it falls back to a CSS
   animation so the glyph still moves while playing.
   ------------------------------------------------------------------ */

const SKIP = 15;
const BARS = 5;
const MISSING_AUDIO = "此件作品的語音尚未提供，可先閱讀文字。";

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* the focused unit's inner rings: brightness / width follow the audio level */
function lightHero(level) {
  const r1 = document.querySelector(".is-focus .hero-ring-1");
  if (!r1) return;
  const r2 = document.querySelector(".is-focus .hero-ring-2");
  const r3 = document.querySelector(".is-focus .hero-ring-3");
  const l = Math.max(0, Math.min(1, level));
  r1.style.opacity = (0.6 + l * 0.4).toFixed(3);
  r1.style.strokeWidth = (6 + l * 6).toFixed(2);
  const clamp = (v) => Math.max(0, Math.min(1, v)).toFixed(3);
  if (r2) { r2.style.opacity = clamp((l - 0.2) / 0.5); r2.style.strokeWidth = (4 + l * 5).toFixed(2); }
  if (r3) { r3.style.opacity = clamp((l - 0.55) / 0.45); r3.style.strokeWidth = (3 + l * 5).toFixed(2); }
}
function resetHero() {
  document.querySelectorAll(".hero-ring").forEach((el) => { el.style.opacity = ""; el.style.strokeWidth = ""; });
}

/* frequency bands (Hz) for the 5 bars — voice-centred; centre bar = lowest band */
const BANDS = [[90, 250], [250, 600], [600, 1400], [1400, 3000], [3000, 6000]];
const BAR_ORDER = [3, 1, 0, 2, 4];   // which band each bar (left→right) shows
const IDLE = [0.45, 0.75, 1.0, 0.65, 0.5]; // resting shape

/* circular-arrow "skip" glyph, iOS-style: an open ring with an arrowhead at
   one end and the seconds in the middle. dir -1 = back (counter-clockwise),
   +1 = forward (clockwise). */
function SkipIcon({ dir, seconds }) {
  const cx = 20, cy = 20, r = 12.5;
  const gap = 34;                       // degrees of opening at the top
  const a0 = (-90 - gap / 2) * Math.PI / 180;   // upper-left end
  const a1 = (-90 + gap / 2) * Math.PI / 180;   // upper-right end
  const P = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  // back: travel clockwise from upper-left around to upper-right, head at upper-left (pointing left/down)
  // forward: mirror
  const [sx, sy] = dir < 0 ? P(a1) : P(a0);
  const [ex, ey] = dir < 0 ? P(a0) : P(a1);
  const sweep = dir < 0 ? 0 : 1;
  const arc = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 1 ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  // arrowhead tangent at the end point
  const ang = dir < 0 ? a0 : a1;
  const tx = dir < 0 ? -Math.sin(ang) : Math.sin(ang);   // direction of travel at the end
  const ty = dir < 0 ? Math.cos(ang) : -Math.cos(ang);
  const nx = -ty, ny = tx;
  const L = 5.8, Wd = 4.2;
  const tip = [ex + tx * L, ey + ty * L];
  const b1 = [ex + nx * Wd, ey + ny * Wd];
  const b2 = [ex - nx * Wd, ey - ny * Wd];
  const head = `M ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} L ${b1[0].toFixed(2)} ${b1[1].toFixed(2)} L ${b2[0].toFixed(2)} ${b2[1].toFixed(2)} Z`;
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d={arc} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d={head} fill="currentColor" />
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fill="currentColor"
        fontSize="12.5" fontWeight="700" fontFamily="inherit">{seconds}</text>
    </svg>
  );
}

export default function DetailSheet({ tour, open, onClose, onStep }) {
  const audioRef = useRef(null);
  const listRef = useRef(null);
  const seeking = useRef(false);
  const grip = useRef(null);
  const barRefs = useRef([]);
  const graph = useRef(null);      // { ctx, analyser, data, hz }
  const meterRaf = useRef(0);

  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState("");
  const [meterFallback, setMeterFallback] = useState(false);

  const cues = useMemo(() => {
    if (!tour) return [];
    if (tour.srt) return parseSrt(tour.srt);
    return (tour.transcript || []).map((t) => ({ start: 0, end: 0, text: t }));
  }, [tour]);
  const hasTiming = !!(tour && tour.srt);
  const cueIdx = hasTiming ? cueIndexAt(cues, time) : -1;

  /* ---- Web Audio analyser (built once, on first play) ---- */
  const ensureGraph = useCallback(() => {
    if (graph.current) return graph.current;
    const a = audioRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!a || !Ctx) return null;
    try {
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(a);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      graph.current = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount), hz: ctx.sampleRate / analyser.fftSize };
    } catch (_) {
      graph.current = null;
      setMeterFallback(true);
    }
    return graph.current;
  }, []);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.getAttribute("src")) { setStatus(MISSING_AUDIO); return; }
    const g = ensureGraph();
    if (g && g.ctx.state === "suspended") g.ctx.resume().catch(() => {});
    a.play().then(() => setPlaying(true)).catch(() => { /* autoplay refused: the play button remains */ });
  }, [ensureGraph]);

  /* load / unload with the tour — and start speaking right away */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setPlaying(false); setTime(0); setDuration(0); setStatus(""); setExpanded(false);
    if (tour && open) {
      a.src = tour.audioSrc;
      a.load();
      play();
    } else {
      a.removeAttribute("src");
    }
  }, [tour, open, play]);

  /* ---- level meter: real amplitude → bar heights ---- */
  useEffect(() => {
    const setBars = (levels) => {
      for (let i = 0; i < BARS; i++) {
        const el = barRefs.current[i];
        if (el) el.style.transform = `scaleY(${levels[i].toFixed(3)})`;
      }
    };
    if (!playing) {
      if (meterRaf.current) cancelAnimationFrame(meterRaf.current);
      meterRaf.current = 0;
      setBars(IDLE);
      resetHero();
      return undefined;
    }
    const g = graph.current;
    if (!g) { setMeterFallback(true); return undefined; }

    let silent = 0, smooth = 0;
    const loop = () => {
      meterRaf.current = requestAnimationFrame(loop);
      g.analyser.getByteFrequencyData(g.data);
      let total = 0;
      const bandLevel = BANDS.map(([lo, hi]) => {
        const i0 = Math.max(1, Math.floor(lo / g.hz)), i1 = Math.min(g.data.length - 1, Math.ceil(hi / g.hz));
        let sum = 0, n = 0;
        for (let i = i0; i <= i1; i++) { sum += g.data[i]; n++; }
        const v = n ? sum / n / 255 : 0;
        total += v;
        return v;
      });
      if (total < 0.002) { if (++silent > 45) setMeterFallback(true); }
      else { silent = 0; setMeterFallback(false); }
      const levels = BAR_ORDER.map((b, i) => {
        const v = Math.pow(bandLevel[b], 0.8);           // gentle compression
        return Math.min(1, 0.18 + Math.min(1, v * 1.6) * (0.82 * IDLE[i] / IDLE[2]));
      });
      setBars(levels);

      // overall loudness (voice bands weighted) → the hero's rings
      const loud = Math.min(1, (bandLevel[0] * 1.0 + bandLevel[1] * 1.2 + bandLevel[2] * 1.0 + bandLevel[3] * 0.6) / 3.8 * 1.35);
      smooth += (loud - smooth) * (loud > smooth ? 0.45 : 0.12);   // fast attack, slow release
      lightHero(smooth);
    };
    loop();
    return () => { if (meterRaf.current) cancelAnimationFrame(meterRaf.current); meterRaf.current = 0; resetHero(); };
  }, [playing]);

  /* keep the highlighted cue in view when the transcript is expanded */
  useEffect(() => {
    if (!expanded || cueIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[cueIdx];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cueIdx, expanded]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.getAttribute("src")) { setStatus(MISSING_AUDIO); return; }
    if (a.paused) play();
    else { a.pause(); setPlaying(false); }
  }, [play]);

  const skip = (d) => {
    const a = audioRef.current;
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + d), a.duration);
    setTime(a.currentTime);
  };

  /* pull the grip up / down to expand / collapse */
  const onGripDown = (e) => { grip.current = { y: e.clientY, id: e.pointerId }; };
  const onGripMove = (e) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (dy < -40) { setExpanded(true); grip.current = null; }
    else if (dy > 40) { setExpanded(false); grip.current = null; }
  };
  const onGripUp = () => { grip.current = null; };

  const pct = duration ? (time / duration) * 100 : 0;
  const subtitle = cueIdx >= 0 ? cues[cueIdx].text : (hasTiming ? "" : (cues[0]?.text || ""));

  return (
    <>
      <div className={`detail-topbar${open ? " open" : ""}`}>
        <button type="button" className="icon-btn" aria-label="返回" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 5L8 12L15 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="icon-btn ring" aria-label="關閉" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>

      <section
        className={`sheet${open ? " open" : ""}${expanded ? " expanded" : ""}`}
        aria-hidden={!open}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
      >
        <audio
          ref={audioRef}
          preload="auto"
          crossOrigin="anonymous"
          onLoadedMetadata={() => setDuration(audioRef.current.duration || 0)}
          onTimeUpdate={() => { if (!seeking.current) setTime(audioRef.current.currentTime); }}
          onEnded={() => { setPlaying(false); }}
          onError={() => setStatus(MISSING_AUDIO)}
        />

        <div className="sheet-glass" aria-hidden="true" />

        <div className="sheet-body">
          <header className="sheet-head">
            <div className="sheet-title">
              <span className="num">{tour ? String(tour.id).padStart(2, "0") : ""}</span>
              <h1>{tour ? tour.title : ""}</h1>
            </div>
            <div className={`wave${playing ? " on" : ""}${meterFallback ? " fallback" : ""}`} aria-hidden="true">
              {Array.from({ length: BARS }, (_, i) => (
                <i key={i} ref={(el) => { barRefs.current[i] = el; }} style={{ transform: `scaleY(${IDLE[i]})` }} />
              ))}
            </div>
          </header>

          {/* collapsed: current subtitle line — expanded: full transcript */}
          <div className="sheet-text">
            <p className="subtitle" key={cueIdx}>{subtitle}</p>
            <div className="transcript" ref={listRef} role="list">
              {cues.map((c, i) => (
                <p key={i} className={i === cueIdx ? "cue current" : "cue"} role="listitem">{c.text}</p>
              ))}
            </div>
            {status && <p className="status">{status}</p>}
          </div>

          <div className="sheet-progress">
            <input
              type="range" className="seek" min="0" max={duration || 100} step="0.1" value={time}
              style={{ "--pct": `${pct}%` }}
              aria-label="播放進度"
              onPointerDown={(e) => e.stopPropagation()}
              onInput={(e) => { seeking.current = true; setTime(+e.target.value); }}
              onChange={(e) => { audioRef.current.currentTime = +e.target.value; seeking.current = false; }}
              onPointerUp={(e) => { audioRef.current.currentTime = +e.target.value; seeking.current = false; }}
            />
            <div className="times"><span>{fmt(time)}</span><span>{fmt(duration)}</span></div>
          </div>

          <div className="sheet-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="nav" aria-label="上一件作品" onClick={() => onStep(-1)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M15 5L8 12L15 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="skip" aria-label={`倒退 ${SKIP} 秒`} onClick={() => skip(-SKIP)}>
              <SkipIcon dir={-1} seconds={SKIP} />
            </button>
            <button type="button" className="play" aria-label={playing ? "暫停" : "播放"} onClick={toggle}>
              {playing ? (
                <svg viewBox="0 0 24 24" fill="none"><rect x="7" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" /><rect x="13.8" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
              )}
            </button>
            <button type="button" className="skip" aria-label={`快轉 ${SKIP} 秒`} onClick={() => skip(SKIP)}>
              <SkipIcon dir={1} seconds={SKIP} />
            </button>
            <button type="button" className="nav" aria-label="下一件作品" onClick={() => onStep(1)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <button
            type="button"
            className="chevron"
            aria-label={expanded ? "收合逐字稿" : "展開完整逐字稿"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>{expanded ? "收合" : "逐字稿"}</span>
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 14l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </section>
    </>
  );
}
