# 甦醒航班 Sleep Airline

## 📌 這個專案的運作方式

這是一個工作坊教學專案。所有學員 fork 各自的版本、部署到自己的 Vercel，但**全部連到同一個共用的 Notion 主資料庫**——主辦用這份資料做論文研究。

因此「主資料庫的結構（欄位、格式）必須完全固定，任何人都不能更動」。

### 兩種資料模式（preview / live）

由 `src/lib/data-mode.ts` 控制：

- **preview**：沒設 `NOTION_API_KEY` 時的預設。完全不碰 Notion，API 走記憶體假資料，供學生改 UI、完整體驗起飛降落。**碰不到主庫。**
- **live**：設了 `NOTION_API_KEY`（或 `SLEEP_AIRLINE_DATA_MODE=live`）時。會讀寫共用主庫。

學生在 Phase 1–2（只改 UI）處於 preview，到 Phase 4 才填 key 進入 live。

## ⚠️ 主庫已鎖死 — 禁止修改下列檔案

程式碼層已做保護：**永遠不會自動修改或建立** Notion 主庫的結構（見 `ensure-dashboard.ts` / `ensure-landscape-db.ts`）。請不要試圖繞過這個保護，也不要修改以下檔案：

- `src/lib/data-mode.ts` — preview/live 判定（改了會讓 fork 的防護失效、意外寫進主庫）
- `src/lib/notion/dashboard-schema.ts` — 主庫欄位定義（改了會讓寫入與主庫不符而失敗）
- `src/lib/notion/landscape-schema.ts` — 風景圖庫欄位定義
- `src/lib/notion/ensure-dashboard.ts` — 主庫解析（已鎖死，不可改回自動同步）
- `src/lib/notion/ensure-landscape-db.ts` — 風景圖庫解析（已鎖死）
- `src/lib/notion/client.ts` — Notion 連線與模式判定
- `src/lib/notion/flights.ts` — 航班資料讀寫，欄位名稱必須與主庫一致
- `src/lib/notion/passengers.ts` — 乘客資料讀寫
- `src/lib/notion/destinations.ts` — 目的地資料

**為什麼：** 所有學員的資料都寫進主辦的同一張主表。任何欄位名稱或結構的變動，都會破壞所有人的資料、污染論文數據。改了之後，受影響的不只是你自己的部署，而是整個共用資料庫。

如果使用者要求新增資料欄位或改變資料格式，**先停下來提醒這會影響共用主庫**，不要直接動手。

## ✅ 可以自由修改的地方

| 檔案 | 可以改什麼 |
|------|-----------|
| `public/style.css` | 顏色、字體、排版、動畫 |
| `public/index.html` | 文字內容、介面結構 |
| `public/app.js` | 前端互動邏輯、額外的前端判定 |
| `src/lib/ai/broadcast.ts` | AI 機長廣播的 prompt 風格 |
| `src/lib/ai/speech.ts` | 語音設定 |
| `src/lib/ai/scenery.ts` | 降落生圖的 prompt 風格 |
| `src/lib/flight/region.ts` | 飛行敘事區域描述 |
| `src/lib/flight/social.ts` | 社交提示文字 |

想做「額外的效果判定」，請在前端（`public/`）或上述可改檔案做，**不要把新欄位寫進共用主庫**。

## 專案架構

- **前端**：`public/` — 純 HTML + CSS + JS，無框架
- **後端**：`server.ts` — Express + TypeScript
- **資料庫**：Notion（共用主庫，透過 `@notionhq/client`）
- **AI**：OpenAI GPT（廣播文字）、TTS（語音）、DALL-E（風景圖）
- **部署**：Vercel

## 環境變數（都設在 Vercel → Settings → Environment Variables）

```
NOTION_API_KEY=          # 設了才進 live 模式、連主庫；不設＝preview，純改 UI
OPENAI_API_KEY=          # 選填，老師提供（AI 廣播 / 語音 / 生圖）
OPENAI_MODEL=            # 選填，預設 gpt-4o-mini
OPENAI_TTS_MODEL=        # 選填，預設 tts-1
OPENAI_IMAGE_MODEL=      # 選填，預設 gpt-image-1-mini
```

- 不要建立 `.env.local` 並 push 到 GitHub，金鑰只放在 Vercel。
- 二選一（學生只需一把 key）：用主辦的 `NOTION_API_KEY`（接共用主庫）；或填自己的 key ＋ 自己的 `NOTION_PARENT_PAGE_ID`（程式自動在你自己的 Notion 建表，資料獨立）。
- `NOTION_ALLOW_SCHEMA_WRITE` 只有主辦首次建主庫時才會用到，學生**絕對不要**設定。
