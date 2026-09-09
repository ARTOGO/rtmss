# 時光渡口・記憶漣漪｜語音導覽

十四張渡口洄聲公共藝術（編號 370）的展場語音導覽網頁。單頁式、完全離線運行，
專為 iPad 第七代（3:4 直式）設計，可用 Safari 全螢幕開啟或包成 App 內嵌 WebView。

線上版：https://artogo.github.io/rtmss/

## 使用流程

1. **首頁**：滿版水面上漂著 10 個作品水波紋，各自呼吸、互相推擠、可拖曳換位置；
   點作品或水面會從作品中心漾出 KV 形狀的漣漪。
2. **點擊作品**：其他作品淡出，被點的那顆游到畫面上方放大、發光、只留編號；
   下方升起一片液態毛玻璃面板，顯示編號＋作品名、**目前播放到的字幕**（來自 .srt）、
   進度條、上一件／後退 15 秒／播放／前進 15 秒／下一件。語音會自動開始播放。
   按上一件／下一件時，上方的水波紋會往一側滑出、下一顆從另一側滑入。
3. **底部「逐字稿 ＋ 箭頭」**（點一下或往上拉）：面板展開成完整逐字稿，目前句子反白並自動捲動。
4. 左上「‹」或右上「×」關閉：面板下降、作品游回原位、其他作品浮現。

## 技術架構

- **React 18 + Vite**，`src/` 依畫面拆成元件。
- 建置時以 `vite-plugin-singlefile` 把 JS / CSS 全部內嵌，輸出**單一** `dist/index.html`，
  可直接雙擊離線開啟，不需伺服器。
- 無任何執行期外部依賴（無 CDN、無 web font），適合離線環境。
- 背景是一張 WebGL 水面：品牌漸層、淡淡流動的水光、以及漣漪扭曲。漣漪的形狀就是 KV 水波紋的
  圓角方形（超橢圓），而且**只會從 10 件作品的中心往外發散**：點作品是強漣漪、點到空白水面由最近的
  作品回應、沒人碰時每幾秒隨機一件作品自己漾一圈。WebGL 不可用時退回同色的純 CSS 漸層。
- 首頁 10 個水波紋單元由一個輕量物理模擬驅動：基準大小統一（`UNIT_SIZE`），各自在 0.6~1.2 倍之間
  以不同週期呼吸、追著緩慢漂移的目標移動、相互軟性推擠，背景漣漪掃過時也會被推動。
- 單元可以**拖曳**：手指按住移動超過 10px 就是拖曳，該顆跟著手指、把鄰居擠開、沿路漾出小漣漪，
  放手處成為新位置（不會被拖出畫面）；幾乎沒移動就放開才算點擊、進入內頁。
- 內頁不是另一個畫面，而是首頁的延伸：被點的單元由物理模擬游到 `HERO` 位置（`tours.js`），
  玻璃面板（`DetailSheet.jsx`）從底部升起；字幕以 `<audio>` 的 timeupdate 對照 srt 時間軸。
- 離線（PWA）：`vite.config.js` 內的 `offlineServiceWorker` 插件在每次 build 後產生 `dist/sw.js`，
  把 dist 裡的每個檔案（頁面、十段 mp3、圖示、manifest）列入預快取，快取名稱帶建置雜湊，
  新版本上線會自動換新、刪舊；音檔的 Range 分段請求會由 SW 回 206，Safari 才能正常拖曳進度。
  App 資訊在 `public/manifest.webmanifest`，圖示在 `public/icon-*.png`。
- 推到 `main` 分支後，GitHub Actions 會自動建置並部署到 GitHub Pages。

## 檔案結構

```
index.html                     ← Vite 入口（meta / title）
src/
  main.jsx                     ← React 掛載點
  App.jsx                      ← 兩個畫面的切換狀態
  styles.css                   ← 全站樣式（色票變數、漸層、水波紋、播放器）
  data/tours.js                ← ★ 導覽內容 (TOURS：作品名 / 音檔 / srt)、水波紋座標 (LAYOUT)、主角位置 (HERO)
  components/
    Backdrop.jsx               ← 背景層（水面 canvas + 暗角）
    WaterBackdrop.jsx          ← WebGL 水面 shader：漸層 + 水光 + 漣漪扭曲 + 指尖觸發
    RippleArt.jsx              ← 官方水波紋原稿 (assets/ripple.svg) 嵌成 <symbol>
    RippleUnit.jsx             ← 首頁單一水波紋單元：原稿 <use> + 飄動 + 脈動 + 按鈕 + 標籤
    HomeScreen.jsx             ← 首頁：標題、10 個水波紋單元、掛上物理模擬
  hooks/useUnitPhysics.js      ← 單元物理：漂移追蹤、呼吸、互斥、漣漪推力（參數在檔頭 P）
  lib/ripples.js               ← 背景與單元共用的漣漪清單與波形公式（參數在 RIPPLE）
  assets/ripple.svg            ← 展覽KV_ol_F_水波紋_彩色.svg 原檔（勿改，換檔即換圖）
    DetailSheet.jsx            ← 內頁玻璃面板：標題、同步字幕、進度、±15 秒、播放、展開逐字稿
  lib/srt.js                   ← SRT 解析與「目前句子」查找
audio/
  track01.mp3 … track10.mp3    ← 正式語音檔放這裡（目前尚未放入）
.github/workflows/deploy.yml   ← 自動建置部署到 GitHub Pages
```

## 本地開發

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 輸出 dist/index.html（單一檔案）
```

## 安裝到展場 iPad（離線使用）

這個網站是 **PWA（可安裝的網頁 App）**：第一次用網路開啟時，會把網頁本體與全部十段音檔
快取進 iPad；之後沒有網路也能完整使用。步驟：

1. iPad 連上網路，用 **Safari** 開 https://artogo.github.io/rtmss/ 。第一次開啟會自動彈出「安裝到 iPad 主畫面」
   說明卡，卡上即時顯示離線內容下載進度（n／15）。之後可用首頁右上的 ⓘ 再叫出來。
2. 等說明卡顯示「離線內容已完整下載」。
3. 點 Safari 的「分享」→ 面板裡點「**檢視較多**」→「**加入主畫面**」→「新增」。主畫面會出現「渡口回聲」圖示。
4. 從主畫面點開圖示（全螢幕、沒有網址列）。**長按左上標題 1.5 秒**會開啟狀態卡，看到「已從主畫面開啟」與
   離線內容 15／15 兩個勾代表安裝完成；此時可以關閉 Wi-Fi 測試，所有作品都應該能播放。
   （ⓘ 按鈕只在瀏覽器模式顯示，主畫面 App 裡不會出現，避免觀眾誤觸。）
5. 展場建議設定：
   - 設定 → 螢幕顯示與亮度 → **自動鎖定：永不**。
   - 設定 → 輔助使用 → **引導使用模式** 開啟；在 App 內連按三下主畫面鍵（或頂端按鈕）啟動，
     可鎖住畫面不讓觀眾跳出 App、關閉硬體按鍵。
   - 控制中心鎖定螢幕方向為直式。
6. 若之後網站有更新：iPad 連網後重新開啟 App，會自動下載新版本，下次開啟即生效。

注意：請從主畫面圖示開啟，不要用 Safari 分頁使用；主畫面 App 的快取不會被 iOS 定期清除。

若不想走 GitHub Pages，也可以自行架站：`npm run build` 後把 `dist/` 整個資料夾放到任何
HTTPS 網站根目錄（或子路徑，路徑皆為相對），流程相同。

## 如何替換成正式內容

1. 音檔放到 `public/audio/trackNN.mp3`，字幕放到 `src/assets/subtitles/trackNN.srt`（標準 SRT，UTF-8）。
2. 編輯 `src/data/tours.js`：

```js
import srt06 from "../assets/subtitles/track06.srt?raw";
// ...
{ id: 6, title: "作品名", audioSrc: "audio/track06.mp3", srt: srt06 }
```

沒有 srt 的作品可以先給 `transcript: ["段落…"]`，面板會顯示文字但不會隨播放同步。
音檔缺漏時面板會顯示「此件作品的語音尚未提供，可先閱讀文字。」

目前 01~10 已對應「聲音文字素材」資料夾的十組素材：變奏山水、意象、悠閒．茶盤茶具組、
誰來唱我們的歌、夏雪、以植代塑、點廢成金、方寸循環、神來之筆、城市礦產的無毒工藝再生。

## 如何調整水波紋位置／大小

同一檔案的 `LAYOUT` 陣列，順序對應 `TOURS`：

```js
{ cx: 17, cy: 12.5, size: 25.5 }
```

- `cx` / `cy`：水波紋中心點（整個視窗的百分比 0~100，畫面是滿版的）
- `size`：呼吸到最大時的直徑（相對視窗短邊的百分比，即 vmin），預設全部等於 `UNIT_SIZE`（26）

## 如何調整視覺細節

- **色票**：`src/styles.css` 開頭的 `:root` 變數
  （赭紅 `#9A4332`／米杏 `#DDCFA4`／深潭青 `#0C6C6C`／霧灰藍 `#92AEB2`）。
- **背景漸層**：`styles.css` 的 `#stage-outer`，由一層線性漸層加四個徑向光暈組成，
  橫式與寬螢幕會自動調整角度。
- **水光強弱**：`WaterBackdrop.jsx` shader 內 `col += light * 0.13` 的係數；流速與密度在
  `caustics()`（`t` 的係數、`q * 2.6`）。
- **漣漪**：`src/lib/ripples.js` 的 `RIPPLE`：`FADE` 存活秒數、`SPEED` 擴散速度、`LAMBDA` 波紋間距、
  `STRENGTH` 推開幅度、`SHAPE_P` 形狀（2 是圓、4 是 KV 圓角方形）。發射強度在 `HomeScreen.jsx`：
  點單元 1.8、點空白水面 0.9、環境自發 0.3~0.55（每 2.8~5.6 秒）。水面以 42% 解析度、最高 30fps 渲染，
  分頁隱藏時暫停，`prefers-reduced-motion` 時只畫靜態一幀且不產生漣漪。
- **水波紋圖**：直接使用設計原稿 `src/assets/ripple.svg`，10 個單元以 `<use>` 引用同一份
  `<symbol>`，線寬、虛線、色段與原稿完全一致。要換圖只需覆蓋這個檔案（保持 viewBox 比例）。
- **水波紋大小**：`RippleUnit.jsx` 的 `ART_SCALE`（原稿寬 ÷ LAYOUT 的 size，預設 1.6），
  數字越大相鄰水波交疊越多；`HIT_FRAC` 是可點擊核心的直徑比例。
- **隱形物理框**：物理模擬以每顆「整張圖」的半寬當邊界（`wallSpring`/`wallDamp` 軟牆＋硬夾），
  左右是畫面邊緣、上方是標題區下緣、下方是底部說明文字上緣（從 DOM 量測）；太靠邊的 LAYOUT 座標
  會依 `homeScale` 自動內縮，飄動、推擠、拖曳都不會壓到文字或超出畫面。
- **單元動態**：`src/hooks/useUnitPhysics.js` 檔頭的 `P`：`wanderAmp`/`wanderPeriod` 漂移範圍與週期、
  `scaleRange` 呼吸區間（預設 0.6~1.2）、`breathPeriod`/`breathPeriod2` 兩層呼吸週期（每顆不同，由編號決定）、
  `contactFrac`/`repel`/`squeeze` 互斥距離、力道與被擠時的縮小量、`rippleForce` 背景漣漪推力、
  `maxOffsetFrac` 離家最遠距離、`labelCounter` 標籤反向補償縮放（預設 0：文字完全跟著單元縮放；1 固定不縮）、
  `dragSpring`/`dragDamp` 拖曳跟手的彈性、`dragShove` 拖曳時推開鄰居的倍率、`dragWakeGap`/`dragWake`
  拖曳尾跡漣漪的間距與強度、`edgeMargin` 放手位置離邊緣的最小距離。點擊與拖曳的門檻在
  `RippleUnit.jsx` 的 `DRAG_THRESHOLD`。
  `prefers-reduced-motion` 時全部回到原位靜止。

## 建議後續優化方向（尚未實作）

- 閒置一段時間自動回首頁（展場公用裝置）。
- 加入書籤／已聽完標記。
- 多語言（中／英）切換。
