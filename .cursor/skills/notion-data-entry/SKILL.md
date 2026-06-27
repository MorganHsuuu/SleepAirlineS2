---
name: notion-data-entry
description: >-
  Defines the shared Notion contract for Sleep Airline workshop forks: each team
  may deploy their own Vercel site and customize UI, but must write to the same
  central Flight Log / Landing Scenery with correct field names and select values.
  Use when forking the repo, setting Vercel env, filling Notion, validating rows,
  onboarding collaborators, or when the user mentions 共用 Notion、各自 Vercel、主資料庫格式.
---

# Sleep Airline — 共用 Notion 契約

## 架構原則（最重要）

Workshop 預期流程：

| 可以自由發揮 | 必須一致（共用契約） |
|---|---|
| 各自 **Vercel 網址**、fork 自己的 repo | **同一組 Notion 主資料庫**（Flight Log + Landing Scenery） |
| `public/` UI、CSS、文案、登入畫面 | **欄位名稱、型別、Select 值** — 見 [reference.md](reference.md) |
| 生圖 prompt、OpenAI 模型、廣播風格 | **寫入 API 行為**：起飛／降落仍要更新正確欄位 |
| 要不要生風景圖、用哪家 OpenAI key | **Group ID / Passenger ID / Flight ID** 規則 |

一句話：**前端各做各的，資料全部匯回主辦人的 Notion，格式不能歪。**

主辦彙整看板、跨組社交提示、風景 backfill 都依這份主庫；任一組寫錯欄位，全 workshop 資料會對不起來。

---

## 兩階段流程（fork 參與者必讀）

避免「還沒接 Notion 就卡在登入／送不出資料」：

### 階段 A — 空殼改風格（先不用 Notion）

```
- [ ] Fork → 部署 Vercel
- [ ] Vercel **不要** 設 NOTION_API_KEY（或設 SLEEP_AIRLINE_DATA_MODE=preview）
- [ ] 只改 public/（HTML、CSS、文案）
- [ ] 開網站 → 頂部會顯示「預覽模式」橫幅
- [ ] 按「進入 UI 預覽（假資料）」→ 可看到主畫面調樣式
- [ ] 此階段登入／起飛／降落 **不會** 寫 Notion（也避免 Vercel 無狀態記憶體問題）
```

本地完整互動測試（仍不寫 Notion）：`npm run dev`，不建 `.env.local` 或設 `SLEEP_AIRLINE_DATA_MODE=preview`。

### 階段 B — 接上主辦主庫（workshop 正式用）

```
- [ ] 向主辦取得 NOTION_API_KEY、NOTION_DASHBOARD_DB_ID、NOTION_LANDSCAPE_DB_ID
- [ ] Vercel 填入上述變數，設 SLEEP_AIRLINE_DATA_MODE=live（或不設，有 key 即 live）
- [ ] Redeploy
- [ ] 確認 GET /api/config 回傳 dataMode: "live"
- [ ] 實測登入 → 起飛 → 降落 → 主庫有新列
```

### 主辦現有部署（不會被改壞）

| 條件 | 行為 |
|---|---|
| 已有 `NOTION_API_KEY` | 預設 **live**，與現在完全相同 |
| 未設 `SLEEP_AIRLINE_DATA_MODE` | 自動判斷，不需改 Vercel |
| 設 `SLEEP_AIRLINE_DATA_MODE=preview` | 即使有 key 也不寫 Notion（僅主辦測 UI 時用） |

---

## Fork 部署 checklist（給各組工程師）

```
- [ ] Fork repo → 部署到自己的 Vercel（網址各組不同，OK）
- [ ] 向主辦取得：NOTION_DASHBOARD_DB_ID、NOTION_LANDSCAPE_DB_ID
- [ ] 向主辦取得：Notion Integration 已加入主庫的 NOTION_API_KEY（或共用 integration）
- [ ] Vercel Environment Variables 設定（見下方）
- [ ] 不要改 `src/lib/notion/dashboard-schema.ts` 的欄位名稱（除非只改本地 UI、仍寫同一 schema）
- [ ] 改完 UI 後，實際走一輪：登入 → 起飛 → 降落 → 確認主庫有新列
- [ ] Group ID 用 `group_0X`，與主辦編號一致
```

### Vercel 環境變數

**階段 A（預覽）— 全部留空即可**

```bash
# 不設 NOTION_API_KEY → 自動 preview
# 或明確指定：
# SLEEP_AIRLINE_DATA_MODE=preview
```

**階段 B（live）— 接上主庫**

```bash
SLEEP_AIRLINE_DATA_MODE=live          # 選填；有 NOTION_API_KEY 時預設即 live
NOTION_API_KEY=ntn_...
NOTION_DASHBOARD_DB_ID=...            # 主辦的 Flight Log
NOTION_LANDSCAPE_DB_ID=...            # 主辦的 Landing Scenery（生圖時）

# 各組自管
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1-mini
```

**禁止**：fork 上設自己的 `NOTION_PARENT_PAGE_ID` 讓程式在別處 **新建** 另一套 Flight Log（會變成資料孤島，主辦看不到）。

## 主辦方（資料庫擁有者）要做的事

1. 在 Notion 建立／維護 **Sleep Airline Flight Log**、**Sleep Airline Landing Scenery**
2. 把兩個 database 的 ID 發給各組
3. 建立一個 Notion Integration，**Invite 進這兩張表**（Can edit）
4. 把 `NOTION_API_KEY` 安全地分發給各組（或每組自建 integration 再 invite 同一批表 — 較安全）
5. Schema 變更只由主辦決定；改 `dashboard-schema.ts` 後通知全組同步

---

# Notion 資料填寫

協助把資料寫進 **主辦的 Sleep Airline Flight Log**，讓主庫與各組 Vercel 都能正確讀取。

## 先確認哪張表

| 資料庫名稱 | 用途 | 誰來寫 |
|---|---|---|
| **Sleep Airline Flight Log** | 主庫：每趟航班一列 | 網站起飛／降落自動寫；必要時人工補 |
| **Sleep Airline Landing Scenery** | 降落風景圖 | **程式自動**（勿手動建，除非除錯） |
| Sleep Airline Dashboard（舊） | Archive | **不要用** |

程式尋表順序：`NOTION_DASHBOARD_DB_ID` → 父頁面下標題為 `Sleep Airline Flight Log` 的 database。

## 黃金規則

1. **欄位名稱必須與程式完全一致**（英文、大小寫、空格）— 見 [reference.md](reference.md)
2. **Select 選項必須用程式內建值**，不可填中文顯示名  
   - ✅ `group_02`　❌ `第二組`  
   - ✅ `landed`　❌ `已降落`
3. **一列 = 一趟航班**（不是一位乘客一列）
4. **Passenger ID 必須與網站登入 ID 完全相同**（大小寫、符號都算）
5. **同一 Passenger ID 同時只能有一列 `in_flight`**
6. **要生風景圖**：`Status` = `landed` 且 **Arrival Location** 必填，格式建議 `城市, 國家`（例：`Naga, Philippines`）

## 建議流程

### A. 正常 workshop（優先）

讓參與者在網站：**登入 → 起飛 → 降落**。Notion 由 API 自動建立／更新，人工不必建列。

### B. 人工補登／匯入舊資料

```
Task Progress:
- [ ] 1. 確認寫入 Flight Log（不是舊 Dashboard）
- [ ] 2. Flight ID 設為 Title 欄且全表唯一
- [ ] 3. Passenger ID / Name / Group ID 與網站一致
- [ ] 4. Status 與時間、座標、地點互相一致
- [ ] 5. Select 值逐項對照 reference.md
- [ ] 6. 若需風景圖：landed + Arrival Location 後跑 backfill
- [ ] 7. 用網站登入該乘客，確認看板與風景區塊
```

### C. 補生成風景圖（已 landed、缺圖）

各組在自己的 Vercel 網址上呼叫（或主辦統一跑）：

```bash
curl -X POST https://你的-vercel.vercel.app/api/scenery/backfill \
  -H "Content-Type: application/json" \
  -d '{"flightIds":["FL-XXX-YYYY"],"force":true}'
```

主辦範例：[sleep-airline-s2.vercel.app](https://sleep-airline-s2.vercel.app/)

本地（需 `.env.local`）：

```bash
npx tsx scripts/backfill-scenery.ts FL-XXX-YYYY
```

## ID 格式慣例

| 欄位 | 格式 | 範例 |
|---|---|---|
| **Flight ID** (Title) | `FL-{乘客ID英數前6碼}-{時間base36}` | `FL-MORGAN-MQV56IO3` |
| **Passenger ID** | 自訂，建議穩定唯一 | `A`、`MORGAN` |
| **Group ID** | `group_01` … `group_05` | `group_02` = 網站「第二組」 |
| **Entry ID** (Scenery) | `SC-{Flight ID}` | 程式自動，勿手改 |

人工建 Flight ID 時可自訂，但須唯一；**Landing Scenery 的 Flight ID 必須與主庫同一趟航班一致**。

## 小隊對照（網站 UI ↔ Notion）

| 網站顯示 | Notion Group ID |
|---|---|
| 第一組 | `group_01` |
| 第二組 | `group_02` |
| 第三組 | `group_03` |
| 第四組 | `group_04` |
| 第五組 | `group_05` |

## 常見錯誤

| 症狀 | 通常原因 |
|---|---|
| 登入後看板沒資料 | Group ID 填中文；或 Passenger ID 與登入不一致 |
| backfill「找不到航班」 | Flight ID 不在 Title 欄；或打錯字 |
| backfill「沒有抵達地點」 | `landed` 但 Arrival Location 空白 |
| 風景圖地點怪 | Arrival Location 未用 `城市, 國家` 格式 |
| 程式讀不到列 | 寫進舊表 Dashboard；或 fork 指到錯的 DB ID；或欄位名稱拼錯 |
| 主辦看不到某組資料 | 該組 Vercel 指到自己的 Notion 而非主庫 ID |
| fork 登入一直失敗 | 已設錯的 NOTION_API_KEY／DB ID；或 preview 模式卻按登入而非 UI 預覽 |
| Vercel 上登入成功但起飛失敗 | 舊版無 preview 時記憶體不持久；請用 UI 預覽改樣式，或接 live |

## 欄位速查

完整型別、允許值、必填條件見 **[reference.md](reference.md)**。

程式 schema 來源（改 schema 時同步更新 skill）：

- `src/lib/notion/dashboard-schema.ts`
- `src/lib/notion/landscape-schema.ts`

## 驗證清單（交給填表人）

人工新增一列 **landed** 航班前確認：

- [ ] Flight ID（Title）唯一
- [ ] Passenger ID = 參與者網站登入 ID
- [ ] Group ID = `group_0X`（不是中文）
- [ ] Status = `landed`
- [ ] Takeoff Time、Landing Time 有填
- [ ] Departure Location + 經緯度合理
- [ ] **Arrival Location** = `City, Country`
- [ ] Arrival Latitude / Longitude 有填（降落邏輯會寫；人工補登請一併填）
- [ ] Created At、Updated At 建議填 ISO 時間

完成後用該 Passenger ID 登入**任一組** Vercel 網站 → 小隊看板應出現此航班（讀同一主庫）→ 若有風景需求再跑 backfill。

## 給非工程師的一句話

> 你們可以換網站長相、換自己的 Vercel 連結；  
> 但起飛降落產生的資料一定要進**主辦那一個 Notion**，欄位名字跟選項不能自己發明。
