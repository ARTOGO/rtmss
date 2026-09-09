import React, { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------
   InstallGuide — for the people setting up the exhibition iPad.

   - In a browser tab (not yet on the home screen) it opens by itself on
     the first visit of a session and walks through: wait for the offline
     download → Share → Add to Home Screen → open from the icon.
   - An ⓘ button on the home screen re-opens it any time; from the home
     screen app it becomes a status card (installed ✓, offline files n/N,
     build id) with a re-check button.
   The offline numbers come from the service worker (STATUS message).
   ------------------------------------------------------------------ */

const isStandalone = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
  window.navigator.standalone === true;

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InstallGuide({ hidden }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);       // { total, cached, build }
  const [standalone, setStandalone] = useState(isStandalone());
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator && !import.meta.env.DEV;

  const query = useCallback(() => {
    if (!supported) return;
    const c = navigator.serviceWorker.controller;
    if (c) c.postMessage({ type: "STATUS" });
  }, [supported]);

  const recheck = useCallback(() => {
    if (!supported) return;
    const c = navigator.serviceWorker.controller;
    if (c) { c.postMessage({ type: "CHECK" }); setTimeout(query, 800); }
  }, [supported, query]);

  useEffect(() => {
    if (!supported) return undefined;
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "SW_STATUS") setStatus(d);
      if (d.type === "SW_READY" || d.type === "SW_CHECKED") query();
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    navigator.serviceWorker.ready.then(query).catch(() => {});
    const t = setInterval(() => {
      const done = status && status.cached >= status.total;
      if (open || !done) query();
    }, 1500);
    return () => { navigator.serviceWorker.removeEventListener("message", onMsg); clearInterval(t); };
  }, [supported, query, open, status]);

  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)");
    const onChange = () => setStandalone(isStandalone());
    mq && mq.addEventListener && mq.addEventListener("change", onChange);
    let seen = false;
    try { seen = sessionStorage.getItem("rtmss-guide-seen") === "1"; } catch (_) { /* private mode */ }
    if (!isStandalone() && !seen) setOpen(true);
    return () => { mq && mq.removeEventListener && mq.removeEventListener("change", onChange); };
  }, []);

  /* staff shortcut from the installed app: long-press the home title */
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("rtmss:open-guide", onOpen);
    return () => window.removeEventListener("rtmss:open-guide", onOpen);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { sessionStorage.setItem("rtmss-guide-seen", "1"); } catch (_) { /* ignore */ }
  };

  const complete = !!(status && status.total > 0 && status.cached >= status.total);
  const offlineLine = !supported
    ? "開發模式：無離線快取"
    : status
      ? (complete ? `離線內容已完整下載（${status.cached}／${status.total}）` : `離線內容下載中… ${status.cached}／${status.total}`)
      : "正在準備離線內容…";

  const vw = window.innerWidth, vh = window.innerHeight;
  const sw = window.screen ? window.screen.width : 0, sh = window.screen ? window.screen.height : 0;
  const vvh = window.visualViewport ? Math.round(window.visualViewport.height) : 0;
  const sab = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue("--sab-px").trim(); } catch (_) { return ""; } })();
  const appH = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue("--app-h").trim(); } catch (_) { return ""; } })();
  const bgH = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue("--bg-h").trim(); } catch (_) { return ""; } })();

  return (
    <>
      <button
        type="button"
        className={`info-btn${hidden || standalone ? " hidden" : ""}`}
        aria-label="安裝與離線狀態說明"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="guide-backdrop" onClick={dismiss}>
          <section className="guide" role="dialog" aria-modal="true" aria-label="安裝說明" onClick={(e) => e.stopPropagation()}>
            <div className="guide-glass" aria-hidden="true" />
            <div className="guide-body">
              <header className="guide-head">
                <h2>{standalone ? "離線版狀態" : "安裝到 iPad 主畫面"}</h2>
                <button type="button" className="guide-close" aria-label="關閉" onClick={dismiss}>
                  <svg viewBox="0 0 24 24" fill="none"><path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              </header>

              <ul className={`guide-status${complete ? " ok" : ""}`}>
                <li className={complete ? "done" : ""}>
                  <span className="mark">{complete ? <CheckIcon /> : <span className="spin" />}</span>
                  <span>{offlineLine}</span>
                </li>
                <li className={standalone ? "done" : ""}>
                  <span className="mark">{standalone ? <CheckIcon /> : <span className="dot" />}</span>
                  <span>{standalone ? "已從主畫面開啟（全螢幕 App 模式）" : "目前在瀏覽器中開啟，尚未加入主畫面"}</span>
                </li>
              </ul>

              {!standalone && (
                <ol className="guide-steps">
                  <li>
                    <span className="n">1</span>
                    <div><strong>等待上方顯示「離線內容已完整下載」</strong><small>十段語音約 6 MB，視網速幾秒到十幾秒。</small></div>
                  </li>
                  <li>
                    <span className="n">2</span>
                    <div><strong>點 Safari 網址列旁的「分享」<i className="ico"><ShareIcon /></i></strong><small>iPad 在畫面右上方，iPhone 在底部中間。</small></div>
                  </li>
                  <li>
                    <span className="n">3</span>
                    <div><strong>在分享面板點「檢視較多」<i className="ico"><MoreIcon /></i>，選「加入主畫面」<i className="ico"><AddIcon /></i>，再點右上「新增」</strong><small>「加入主畫面」在展開後的清單裡，找不到時往下捲。</small></div>
                  </li>
                  <li>
                    <span className="n">4</span>
                    <div><strong>之後都從主畫面的「渡口回聲」圖示開啟</strong><small>沒有網路也能完整使用；請勿用 Safari 分頁播放。</small></div>
                  </li>
                </ol>
              )}

              {standalone && (
                <div className="guide-kiosk">
                  <p className="guide-note">
                    離線安裝已完成，這台裝置沒有網路也能使用。<strong>長按首頁左上的標題 1.5 秒</strong>
                    可隨時開啟這張卡；觀眾不會看到它。
                  </p>

                  <h3>展場設定（佈展時各做一次）</h3>
                  <ol className="guide-steps">
                    <li>
                      <span className="n">1</span>
                      <div>
                        <strong>讓螢幕不要自動關掉</strong>
                        <small>
                          「設定」App → 螢幕顯示與亮度 → 自動鎖定 → 選「<b>永不</b>」。<br />
                          預設幾分鐘沒人操作就會關螢幕，觀眾會以為機器壞了。螢幕全天亮著較耗電，木箱內請接著電源。
                        </small>
                      </div>
                    </li>
                    <li>
                      <span className="n">2</span>
                      <div>
                        <strong>把觀眾鎖在這個 App 裡（引導使用模式）</strong>
                        <small>
                          開啟後觀眾無法滑出去、跳到其他 App 或更改設定，只能使用語音導覽；要離開需輸入密碼。<br />
                          <b>①</b> 「設定」App → 輔助使用 → 引導使用模式 → 打開，並在「密碼設定」中設一組密碼。<br />
                          <b>②</b> 回到本 App，<b>連按三下實體按鍵</b>（有 Home 鍵的機型按 Home 鍵，沒有 Home 鍵的按頂端電源鍵），
                          再點畫面上的「開始」。<br />
                          <b>③</b> 要解除：同樣連按三下，輸入密碼後點「結束」。
                        </small>
                      </div>
                    </li>
                  </ol>
                </div>
              )}

              <footer className="guide-foot">
                <span className="meta">
                  {status && status.build ? `版本 ${status.build} · ` : ""}視窗 {vw}×{vh}{vvh ? ` · 可見 ${vvh}` : ""}{sw ? ` · 螢幕 ${sw}×${sh}` : ""}{sab ? ` · 底部安全區 ${sab}` : ""}{appH ? ` · 舞台 ${appH}` : ""}{bgH ? ` · 背景 ${bgH}` : ""}
                </span>
                {supported && (
                  <button type="button" className="guide-recheck" onClick={recheck}>重新檢查</button>
                )}
              </footer>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
