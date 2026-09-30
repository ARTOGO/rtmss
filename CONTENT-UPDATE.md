# 內容更新交接文件

> 這份文件寫給接手更新語音導覽內容的工程師（或下一個 AI 助理）。
> 目標：拿到氣化提供的**音檔、作品標題、逐字稿**之後，把它們換進這個專案並上線。
> 不需要碰任何動畫、版面或 iOS 相關的程式碼。

專案：十四張渡口洄聲公共藝術（編號 370）展場語音導覽
線上版：<https://artogo.github.io/rtmss/>
儲存庫：<https://github.com/ARTOGO/rtmss>

---

## 0. 三十秒版本

```bash
git clone https://github.com/ARTOGO/rtmss.git && cd rtmss
npm install
npm run import-content -- "素材資料夾的完整路徑" --dry   # 先試算，確認對照表
npm run import-content -- "素材資料夾的完整路徑"          # 正式匯入
npm run dev                                              # 本機檢查
git add -A && git commit -m "Update guide content" && git push
```

推上 `main` 之後 GitHub Actions 會自動建置並部署，約 2 到 5 分鐘生效。

---

## 1. 你會拿到什麼，專案要什麼

氣化會提供每件作品三樣東西：**音檔**、**作品標題**、**逐字稿（.srt 字幕檔）**。

專案用「編號」把三者綁在一起，編號就是首頁水波紋上顯示的 01、02、03…

| 內容 | 放在哪裡 | 檔名規則 |
|---|---|---|
| 音檔 | `public/audio/` | `track01.mp3`、`track02.mp3`…（兩位數，從 01 連號） |
| 逐字稿 | `src/assets/subtitles/` | `track01.srt`、`track02.srt`…（UTF-8，標準 SRT） |
| 作品標題 | `src/data/tours.js` 的 `WORKS` 陣列 | 依相同順序排列，第一個就是 01 |

**只要這三處對齊，其他全部自動處理**：首頁水波紋的數量與位置、內頁標題、字幕同步、上一件／下一件、離線快取清單，都會跟著改變。

作品數量不限於 10 件。多於 10 件時版面會自動補上分散的位置，少於 10 件也沒問題。

---

## 2. 方法 A：用腳本自動匯入（建議）

氣化如果是整包資料夾交付，裡面每件作品有一組同名的音檔與字幕檔，例如：

```
1-1　變奏山水.mp3      1-1　變奏山水.srt
1-2　意象.mp3          1-2　意象.srt
...
2-5　城市礦產的無毒工藝再生.mp3   2-5　城市礦產的無毒工藝再生.srt
```

直接跑：

```bash
npm run import-content -- "J:\共用雲端硬碟\...\聲音文字素材" --dry
```

`--dry` 只試算不寫入，會印出這樣的對照表讓你先確認順序與標題：

```
  01  變奏山水   ←  1-1　變奏山水.mp3   字幕:有
  02  意象   ←  1-2　意象.mp3   字幕:有
  ...
```

確認無誤後拿掉 `--dry` 正式執行。腳本會做四件事：

1. 音檔複製成 `public/audio/track01.mp3`、`track02.mp3`…
2. 字幕轉成 UTF-8（去 BOM、換行統一）複製成 `src/assets/subtitles/track01.srt`…
3. 改寫 `src/data/tours.js` 裡 `WORKS:START` 與 `WORKS:END` 之間的作品清單
4. 印出結果，並提醒缺字幕、標題解析失敗、非 mp3 等狀況

**排序規則**：依檔名開頭的編號，支援 `1-1`、`1_1`、`01`、`1.` 等寫法。
**標題規則**：檔名去掉副檔名與開頭編號後的文字。解析不出來時會填 `作品01` 這種暫定名稱並提醒你手動改。

上一批留下的多餘檔案預設只會提醒不會刪，確定要清掉就加 `--clean`：

```bash
npm run import-content -- "素材資料夾" --clean
```

---

## 3. 方法 B：手動更換（檔名不規則，或只換一兩件時）

1. 把音檔改名成 `trackNN.mp3` 放進 `public/audio/`。
2. 把字幕改名成 `trackNN.srt` 放進 `src/assets/subtitles/`，存成 **UTF-8**。
3. 打開 `src/data/tours.js`，改 `WORKS` 陣列，順序就是編號順序：

```js
export const WORKS = [
  "變奏山水",              // → 01，用 track01.mp3 + track01.srt
  "意象",                  // → 02
  "悠閒．茶盤茶具組",       // → 03
  // …依此類推，直接增減行數就能增減作品
];
```

不需要新增任何 `import` 陳述式，字幕檔會自動被讀取。

**音檔不是 mp3 時**（例如 m4a），把該項改成物件指定檔名：

```js
export const WORKS = [
  { title: "變奏山水", audio: "track01.m4a" },
  "意象",
];
```

iPad Safari 可以播 mp3 與 m4a。wav 檔案太大，不建議用於離線版。

---

## 4. 本機檢查清單

```bash
npm run dev     # http://127.0.0.1:5173
```

逐項確認：

- [ ] 首頁水波紋數量正確，編號 01 到最後一件連號不跳號
- [ ] 每顆水波紋上的作品名正確、沒有錯字
- [ ] 點進任一件會**自動開始播放**，標題正確
- [ ] 字幕跟著語音走，換句時機正確（這代表 srt 時間軸對得上音檔）
- [ ] 點底部「逐字稿」展開，全文正確、目前句子會反白並自動捲動
- [ ] 上一件／下一件可以循環切換，最後一件的下一件會回到第一件
- [ ] 瀏覽器主控台（F12）沒有紅色錯誤

開發模式下若有作品缺字幕檔，主控台會印出 `[內容檢查] 第 NN 件…找不到字幕檔` 的提醒。缺字幕不會讓程式壞掉，那件作品仍可播放，只是不顯示字幕。

最後確認可以建置：

```bash
npm run build
```

成功時會印出 `[offline-sw] sw.js written — build xxxxxxxx, N files precached`，`N` 應該等於「音檔數 + 頁面 + 圖示 + manifest」。新增的音檔會自動被納入離線快取，不需要改任何設定。

---

## 5. 上線

```bash
git add -A
git commit -m "Update guide content"
git push
```

推到 `main` 會觸發 GitHub Actions（`.github/workflows/deploy.yml`），自動建置並部署到 GitHub Pages，約 2 到 5 分鐘。

確認方式：開 <https://artogo.github.io/rtmss/>，或用指令看版本編號有沒有變：

```bash
curl -s https://artogo.github.io/rtmss/sw.js | grep BUILD
```

---

## 6. 展場 iPad 怎麼拿到新內容

展場的 iPad 是把網頁「加入主畫面」後的離線 App，內容存在裝置裡，所以**必須連網一次**才會更新：

1. iPad 連上 Wi-Fi。
2. 從主畫面開啟「渡口回聲」App。
3. 它會在背景下載新版本，停在首頁時會自動重新載入一次（正在播放時會等回首頁再更新）。
4. 確認：**長按首頁左上角的標題約 1.5 秒**會跳出狀態卡，看最底下那行的「版本 xxxxxxxx」是否等於新版本，以及「離線內容已完整下載（N／N）」兩個勾。
5. 更新完成後可關閉 Wi-Fi 測試，所有作品都應該能播放。

如果版本沒變，把 App 完全關閉（上滑結束）再重開一次。

---

## 7. 常見狀況

**字幕跟語音對不上**
srt 的時間軸沒有對應這支音檔。字幕是依音檔播放時間對照的，請氣化提供與最終音檔一致的 srt，或請他們重新輸出。

**某件作品沒有字幕**
不影響運作，該件只是不顯示字幕。之後補上 `trackNN.srt` 再推一次即可。

**作品標題太長**
首頁上會自動折成兩行，內頁面板上放不下時會自動變成左右來回的跑馬燈，不需要手動處理。真的太長建議請氣化提供簡稱。

**作品數量改變**
直接增減 `WORKS` 的行數即可。超過 10 件時，第 11 件以後會自動取得分散的位置。若要精準控制構圖，編輯 `src/data/tours.js` 裡的 `BASE_LAYOUT`，每項是 `{ cx, cy }`（整個畫面的百分比）。座標不必算得很準，物理模擬會把水波紋維持在標題與底部文字之間、互相推開、不超出畫面。

**音檔總容量**
目前 10 段約 **76 MB**（最長一段 18 MB）。這些檔案會整包存進 iPad，量偏大，影響的是
安裝時的下載時間與裝置容量，播放本身沒問題。若要縮小，語音類內容用單聲道 64~96 kbps
重新輸出通常可以降到 15~20 MB，聽感幾乎沒有差別。換檔後照原流程重新匯入即可。

**想改首頁的標題與提示文字**
在 `src/components/HomeScreen.jsx`：主標「時光渡口・記憶漣漪」、英文副標、底部「點擊水波，聆聽歲月深處的回聲」都在該檔案內。

---

## 8. 專案速查（給工程師與下一個 AI）

```
src/data/tours.js          ★ 內容設定：WORKS 作品清單、BASE_LAYOUT 座標、HERO 主角位置
src/assets/subtitles/      ★ 字幕檔 trackNN.srt（建置時內嵌，離線可用）
public/audio/              ★ 音檔 trackNN.mp3（建置時原樣複製到 dist/audio/）
scripts/import-content.mjs   一鍵匯入腳本
src/components/HomeScreen.jsx   首頁：標題、水波紋單元、漣漪來源
src/components/DetailSheet.jsx  內頁玻璃面板：標題、字幕、播放控制、逐字稿
src/components/RippleUnit.jsx   單一水波紋（圖、可點核心、標籤）
src/components/WaterBackdrop.jsx  WebGL 水面（漸層、水光、漣漪扭曲）
src/hooks/useUnitPhysics.js     水波紋物理：漂移、呼吸、互斥、拖曳、主角游動
src/lib/srt.js                  SRT 解析與「目前句子」查找
vite.config.js                  建置設定 ＋ 離線 service worker 產生器
.github/workflows/deploy.yml    推 main 自動部署到 GitHub Pages
```

技術重點：

- React 18 + Vite；建置輸出單一 `dist/index.html`（JS／CSS／SVG／字幕全內嵌）＋ `dist/audio/`。
- 離線靠自製 service worker：把 `dist` 裡每個檔案預先快取，快取名稱帶建置雜湊，新版會自動換新刪舊，並支援音檔的 Range 分段請求（Safari 拖曳進度需要）。
- 首頁與內頁是同一層畫面，不是路由切換；點作品後該顆水波紋游到上方、玻璃面板升起。
- **效能**：展場 iPad 要連續運轉整天，2026-09-30 做過一次省電調整，動這些地方前請先了解原因：
  背景的 WebGL 水面預設關閉（`Backdrop.jsx` 的 `WATER_EFFECT`）；物理模擬跑 30fps 且內頁開啟時
  凍結看不見的單元；主角發光圈只改透明度，不可改線寬或幾何（會讓模糊濾鏡每幀重算，是發熱主因）。
- iOS 主畫面 App 模式下，排版區以外的區域只能填單一顏色，所以頁面底部刻意收斂成 `--edge`（`src/styles.css`）。動這段之前先讀懂原因。

---

## 9. 更新前後負責人

- 專案窗口：ARTOGO（luga@artogo.co）
- 內容提供：氣化
- 交接時間：2026 年 9 月

有任何改動請照常 commit 到 `main`，不要直接改 GitHub Pages 的產物。
