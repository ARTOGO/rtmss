import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSrt, cueIndexAt } from "../lib/srt.js";
import { LEVEL_HZ, levelsFor } from "../data/levels.js";

/* ------------------------------------------------------------------
   DetailSheet — the frosted "liquid glass" sheet that rises from the
   bottom when a tour is opened. The focused ripple keeps floating in
   the home layer above it (see useUnitPhysics focus mode).

   Collapsed: number + title, the subtitle line currently being spoken
   (from the tour's .srt), progress bar, −15 / play-pause / +15, chevron.
   Expanded (chevron or pull up): the subtitle line becomes the full
   transcript, current cue highlighted and kept in view.

   Audio starts automatically when the sheet opens (the tap that opened
   it counts as the user gesture).

   The focused ripple's rings brighten with the voice. That level is NOT
   measured while playing: it is read from a curve computed at build time
   (src/data/levels.js, see scripts/prepare-audio.mjs) and looked up by
   currentTime. Measuring it live meant routing the audio through a Web
   Audio AnalyserNode, which on iOS takes playback off the system's media
   path — the exhibition iPad then dropped out whenever the main thread
   was busy. A table lookup looks the same and costs nothing.
   ------------------------------------------------------------------ */

const SKIP = 15;
const MISSING_AUDIO = "此件作品的語音尚未提供，可先閱讀文字。";

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* The focused unit's inner rings brighten with the audio level.
   OPACITY ONLY, and only when it actually changes: these paths carry a blur
   filter, and touching stroke width or geometry would re-run that filter on
   every frame (the main reason phones heated up while playing). */
const glowNow = [-1, -1, -1];
function lightHero(level) {
  const rings = [
    document.querySelector(".is-focus .hero-ring-1"),
    document.querySelector(".is-focus .hero-ring-2"),
    document.querySelector(".is-focus .hero-ring-3")
  ];
  if (!rings[0]) return;
  const l = Math.max(0, Math.min(1, level));
  const want = [
    0.6 + l * 0.4,
    Math.max(0, Math.min(1, (l - 0.2) / 0.5)),
    Math.max(0, Math.min(1, (l - 0.55) / 0.45))
  ];
  for (let i = 0; i < 3; i++) {
    const el = rings[i];
    if (!el) continue;
    const q = Math.round(want[i] * 20) / 20;      // quantise: at most 21 distinct values
    if (q === glowNow[i]) continue;               // skip identical writes
    glowNow[i] = q;
    el.style.opacity = q.toFixed(2);
  }
}
function resetHero() {
  glowNow[0] = glowNow[1] = glowNow[2] = -1;
  document.querySelectorAll(".hero-ring").forEach((el) => { el.style.opacity = ""; el.style.strokeWidth = ""; });
}

/* Material-style transport glyphs (24-unit grid). The skip glyph is the
   "replay" / "forward" ring-arrow with the seconds set inside. */
const REPLAY_D = "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z";
const FORWARD_D = "M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z";

function SkipIcon({ dir, seconds }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={dir < 0 ? REPLAY_D : FORWARD_D} fill="currentColor" />
      <text x="12" y="15.6" textAnchor="middle" fill="currentColor"
        fontSize="6.6" fontWeight="700" fontFamily="inherit" letterSpacing="-0.2">{seconds}</text>
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" fill="currentColor" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" fill="currentColor" />
    </svg>
  );
}

export default function DetailSheet({ tour, open, onClose, onStep }) {
  const audioRef = useRef(null);
  const listRef = useRef(null);
  const seeking = useRef(false);
  const grip = useRef(null);
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const titleWrapRef = useRef(null);
  const titleRef = useRef(null);
  const [marquee, setMarquee] = useState(0);   // px the title must travel, 0 = fits
  const meterRaf = useRef(0);

  const subRef = useRef(null);
  const lastSubH = useRef(-1);
  const [refit, setRefit] = useState(0);   // bumped only when the subtitle's height changes

  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState("");

  const cues = useMemo(() => {
    if (!tour) return [];
    if (tour.srt) return parseSrt(tour.srt);
    return (tour.transcript || []).map((t) => ({ start: 0, end: 0, text: t }));
  }, [tour]);
  const hasTiming = !!(tour && tour.srt);
  const cueIdx = hasTiming ? cueIndexAt(cues, time) : -1;

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.getAttribute("src")) { setStatus(MISSING_AUDIO); return; }
    a.play().then(() => setPlaying(true)).catch(() => { /* autoplay refused: the play button remains */ });
  }, []);

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

  /* ---- ring glow: read the pre-computed level curve at currentTime ----
     Costs one array lookup per tick. Nothing touches the audio itself, so
     playback keeps the system's own media path (see the note at the top). */
  useEffect(() => {
    if (!playing) {
      if (meterRaf.current) cancelAnimationFrame(meterRaf.current);
      meterRaf.current = 0;
      resetHero();
      return undefined;
    }
    const a = audioRef.current;
    const env = tour ? levelsFor(tour.id) : null;
    if (!a || !env || !env.length) { resetHero(); return undefined; }

    let smooth = 0, last = 0;
    const GAP = 1000 / 20;              // the curve itself is 20 points a second
    const loop = (now) => {
      meterRaf.current = requestAnimationFrame(loop);
      if (now - last < GAP) return;
      last = now;
      const i = Math.floor(a.currentTime * LEVEL_HZ);
      const loud = i >= 0 && i < env.length ? env[i] / 255 : 0;
      smooth += (loud - smooth) * (loud > smooth ? 0.45 : 0.12);   // fast attack, slow release
      lightHero(smooth);
    };
    loop();
    return () => { if (meterRaf.current) cancelAnimationFrame(meterRaf.current); meterRaf.current = 0; resetHero(); };
  }, [playing, tour]);

  /* collapsed height follows the content (never below 41% of the stage), so a
     short viewport (iPad Safari with toolbars) can't squash the subtitle onto
     the progress bar; expanded height comes from CSS */
  useEffect(() => {
    const sheet = sheetRef.current, body = bodyRef.current;
    if (!sheet || !body) return undefined;
    const fit = () => {
      if (expanded) { sheet.style.height = ""; return; }
      const stageH = sheet.parentElement ? sheet.parentElement.clientHeight : window.innerHeight;
      // measure the natural content height (scrollHeight never shrinks below the
      // current box, so release the box first), then apply the floor
      sheet.style.height = "auto";
      // scrollHeight of a flex column leaves out padding-bottom, which matters
      // now that --kiosk-lift adds a lot of it: measure to the last child and
      // add the padding ourselves, or the controls fall off the bottom edge
      const pb = parseFloat(getComputedStyle(body).paddingBottom) || 0;
      const last = body.lastElementChild;
      const need = last
        ? last.getBoundingClientRect().bottom - body.getBoundingClientRect().top + pb
        : body.scrollHeight;
      sheet.style.height = Math.max(need, stageH * 0.36) + "px";
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [expanded, open, tour, refit]);

  /* The subtitle box reserves two lines, so one cue to the next almost never
     changes how tall the sheet has to be. Re-running fit() on every cue was
     forcing two full relayouts of the frosted panel every couple of seconds —
     and resizing a backdrop-filter element repaints its blur. Measure the
     subtitle instead (one read, no mutation) and only re-fit when its height
     really moved, i.e. when a line wraps. */
  useEffect(() => {
    const sub = subRef.current;
    if (!sub || expanded) return;
    const h = sub.getBoundingClientRect().height;
    if (Math.abs(h - lastSubH.current) > 1) { lastSubH.current = h; setRefit((n) => n + 1); }
  }, [cueIdx, expanded, open, tour]);

  /* long title: measure the overflow and let CSS sweep it back and forth */
  useEffect(() => {
    const wrap = titleWrapRef.current, h1 = titleRef.current;
    if (!wrap || !h1) return undefined;
    const fit = () => {
      const over = h1.scrollWidth - wrap.clientWidth;
      setMarquee(over > 4 ? over : 0);
    };
    const t = setTimeout(fit, 60);
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); };
  }, [tour, open]);

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
        ref={sheetRef}
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
          onLoadedMetadata={() => setDuration(audioRef.current.duration || 0)}
          onTimeUpdate={() => { if (!seeking.current) setTime(audioRef.current.currentTime); }}
          onEnded={() => { setPlaying(false); }}
          onError={() => setStatus(MISSING_AUDIO)}
        />

        <div className="sheet-glass" aria-hidden="true" />

        <div className="sheet-body" ref={bodyRef}>
          <header className="sheet-head">
            <div className="sheet-title" ref={titleWrapRef}>
              <h1
                ref={titleRef}
                className={marquee ? "marquee" : ""}
                style={marquee ? { "--shift": `-${marquee + 12}px`, "--dur": `${Math.max(6, 4 + marquee / 25)}s` } : undefined}
              >
                {tour ? tour.title : ""}
              </h1>
            </div>
          </header>

          {/* collapsed: current subtitle line — expanded: full transcript */}
          <div className="sheet-text">
            <p className="subtitle" key={cueIdx} ref={subRef}>{subtitle}</p>
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
              <PrevIcon />
            </button>
            <button type="button" className="skip" aria-label={`倒退 ${SKIP} 秒`} onClick={() => skip(-SKIP)}>
              <SkipIcon dir={-1} seconds={SKIP} />
            </button>
            <button type="button" className="play" aria-label={playing ? "暫停" : "播放"} onClick={toggle}>
              {playing ? (
                <svg viewBox="0 0 24 24" fill="none"><rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" /><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              )}
            </button>
            <button type="button" className="skip" aria-label={`快轉 ${SKIP} 秒`} onClick={() => skip(SKIP)}>
              <SkipIcon dir={1} seconds={SKIP} />
            </button>
            <button type="button" className="nav" aria-label="下一件作品" onClick={() => onStep(1)}>
              <NextIcon />
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
