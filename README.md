# El Perrito Busca el Tesoro（小狗找寶藏）

> 聽中文方向指令（前進、後退、向左轉、向右轉、向後轉），帶小狗找鑰匙、找寶藏

- **網址：** https://wangchiapin.github.io/El-Perrito-Busca-el-Tesoro/
- **Firebase 專案：** memorma-24dab（排行榜，匿名登入；2026-10-21 由舊的 perrito-busca-el-tesoro 專案併進來，舊專案不再使用）
- **狀態：** 使用中（v2-0，開始頁最下面的小字是版本號）

## 關卡

| 關卡 | 障礙物 | 先找鑰匙 | 文字 | 指令 | 排行榜 |
|---|---|---|---|---|---|
| 1 | 7–15 | 否 | 有 | 一次一句 | 練習關，不上榜；同一句錯 3 次，該按的方向鍵會發亮 |
| 2 | 15–25 | 是 | 有 | 一次一句 | 有 |
| 3 | 20–30 | 是 | 只有聲音 | 一次一句 | 有 |
| 4 | 20–30 | 是 | 只有聲音 | 2～3 句一組，一句一句唸、中間停一下 | 有 |

按錯：小狗回到「這一組」的起點，整組重唸。🔊 再聽一次不限次數（結果畫面會顯示次數）。

## ⚙️ 基本設定（與跑吧！漢字、色數消消樂、比比看共用）

存在 localStorage `hanziGames.settings`，格式見 `corre/README.md`。

- `script` 繁／簡、`lang` 中＋西／中＋英／只有中文、`phon` 拼音／注音／兩個都顯示／關（台灣讀音，「一格」唸 yì）
- `rate` 慢／正常／快 → 這款是 **0.45／0.65／0.85**；第 4 關句子之間停 1／0.6／0.35 秒。數字在 `index.html` 的 `RATE_VALUE`、`CHUNK_GAP`

## 計分

分數 = 正確率 × 1000 − 每步平均「思考時間」× 50（0～1000）。思考時間不含語音播放與暫停，選慢速、多按 🔊 都不會被扣分。

結果畫面順序（三款統一）：分數 → 評語（依正確率五級）→ 排行榜 → 再玩一次／下一關 → 主選單。

## 排行榜

`perrito_boards/{level2|level3|level4}/entries/{uid}`：每台裝置每關只留最高分，顯示前 10 名；同分比思考時間。規則正本在 game-kit（私人 repo）的 `firebase-rules/``memorma-24dab.rules.txt`（整份貼到 memorma-24dab）；這個 repo 不放規則檔。

## 遊玩紀錄
2026-10-21 起記錄訪客、開始、玩完，寫到 `memorma-24dab` 的 `plays`、`visits`（程式裡「遊玩紀錄」那一段）。

## 分享連結預覽（2026-10-28）
把網址貼到 LINE、WhatsApp 時，會顯示遊戲名稱「小狗找寶藏 · El Perrito Busca el Tesoro」和縮圖。縮圖是根目錄的 `og.jpg`（1200x630）；名稱與說明文字寫在 `index.html` `<head>` 的 `og:title`、`og:description`。

## 測試

`node tests/run.js`（Playwright；語音與 Firebase 都用替身，不碰真的資料庫）。

另有 `tests/test_options.js`（2026-10-30，約 120 項）：語速三檔、第 3 關、拼音加注音同時顯示、靜音、方向鍵、`?audio=`／`?vol=`。

## 手機瀏覽器備註：捲動後回不到頂端（2026-10-24）
iPhone 版 Chrome 上，頁面可以捲動時，往下捲之後有時回不到最上面（Safari 正常）。
處理方式（已套用在本遊戲）：
- `<meta name="viewport">` 設 `maximum-scale=1`，不使用 `viewport-fit=cover`。
- `<html>` 加 `html{color-scheme:light}`。

兩項一起改後，手機 Chrome 測試恢復正常；尚未分開測是哪一項有效。新增頁面請照這個寫。
