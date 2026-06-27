# 甦醒航班 Sleep Airline

## 📌 這個專案的運作方式

這是一個工作坊教學專案。所有學員 fork 各自的版本、部署到自己的 Vercel，但**全部連到主辦的同一個 Notion 總表**——主辦用這份資料做論文研究。

因此「主資料庫的結構（欄位、格式）必須完全固定，任何人都不能更動」。

### 兩種資料模式（preview / live）

由 `src/lib/data-mode.ts` 控制：

- **preview**：沒設 `NOTION_API_KEY` 時的預設。完全不碰 Notion，供學生改 UI。**碰不到主庫。**
- **live**：設了主辦提供的 Notion 變數後。起飛／降落寫進**共用總表**。

學生流程：**先 preview 改風格 → 再填主辦給的三個 Notion 變數 → redeploy**。

## 學生 Vercel 要填什麼（只有這些）

向主辦索取，全部貼到 Vercel Environment Variables：

```
NOTION_API_KEY=              # 主辦提供的 Integration key
NOTION_DASHBOARD_DB_ID=      # 主辦的 Flight Log 總表 ID
NOTION_LANDSCAPE_DB_ID=      # 主辦的 Landing Scenery ID（要生風景圖時）
OPENAI_API_KEY=              # 選填，主辦提供或自備
```

**不要**設定 `NOTION_PARENT_PAGE_ID`、`NOTION_ALLOW_SCHEMA_WRITE`。

## ⚠️ 主庫已鎖死 — 禁止修改下列檔案

程式碼層已做保護：**永遠不會自動修改或建立** Notion 主庫的結構（見 `ensure-dashboard.ts` / `ensure-landscape-db.ts`）。請不要試圖繞過這個保護，也不要修改以下檔案：

- `src/lib/data-mode.ts` — preview/live 判定
- `src/lib/notion/dashboard-schema.ts` — 主庫欄位定義
- `src/lib/notion/landscape-schema.ts` — 風景圖庫欄位定義
- `src/lib/notion/ensure-dashboard.ts` — 主庫解析（已鎖死）
- `src/lib/notion/ensure-landscape-db.ts` — 風景圖庫解析（已鎖死）
- `src/lib/notion/client.ts` — Notion 連線
- `src/lib/notion/flights.ts`、`passengers.ts`、`destinations.ts` — 資料讀寫

**為什麼：** 所有學員的資料都寫進主辦的同一張主表。任何欄位名稱或結構的變動，都會破壞所有人的資料、污染論文數據。

如果使用者要求新增資料欄位或改變資料格式，**先停下來提醒這會影響共用主庫**，不要直接動手。

## ✅ 可以自由修改的地方

| 檔案 | 可以改什麼 |
|------|-----------|
| `public/style.css` | 顏色、字體、排版、動畫 |
| `public/index.html` | 文字內容、介面結構 |
| `public/app.js` | 前端互動邏輯 |
| `src/lib/ai/broadcast.ts` | AI 機長廣播的 prompt 風格 |
| `src/lib/ai/speech.ts` | 語音設定 |
| `src/lib/ai/scenery.ts` | 降落生圖的 prompt 風格 |
| `src/lib/flight/region.ts` | 飛行敘事區域描述 |
| `src/lib/flight/social.ts` | 社交提示文字 |

想做「額外的效果判定」，請在前端（`public/`）或上述可改檔案做，**不要把新欄位寫進共用主庫**。

## 專案架構

- **前端**：`public/` — 純 HTML + CSS + JS
- **後端**：`server.ts` — Express + TypeScript
- **資料庫**：Notion 共用總表（`@notionhq/client`）
- **AI**：OpenAI（廣播、語音、生圖）
- **部署**：Vercel

- 金鑰只放在 Vercel，不要 push `.env.local` 到 GitHub。
