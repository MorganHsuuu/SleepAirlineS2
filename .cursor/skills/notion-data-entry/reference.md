# Sleep Airline Flight Log — 欄位參考

> **共用契約**：所有 workshop fork 寫入的必須是**同一份**主庫，欄位定義以本文為準。UI／CSS 各組可不同。

資料庫標題：**Sleep Airline Flight Log**  
一列 = 一趟航班。

---

## Fork 與主庫對接

| 角色 | 責任 |
|---|---|
| **主辦** | 擁有 Flight Log + Landing Scenery；提供 DB ID；管理 schema 變更 |
| **各組** | 自有 Vercel + 可改 `public/`；env 指向主庫 ID；不可私建第二套主表 |

### 主辦分發給各組的資訊範本（複製貼上）

```text
NOTION_API_KEY=ntn_...
NOTION_DASHBOARD_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_LANDSCAPE_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

學員**只需這三項**，全部貼 Vercel → Redeploy。勿設定 NOTION_PARENT_PAGE_ID。

### 資料模式（SLEEP_AIRLINE_DATA_MODE）

| 模式 | 何時 | Notion | UI |
|---|---|---|---|
| `preview` | 無 key，或明確設 preview | 不讀寫 | 橫幅 +「UI 預覽」假資料 |
| `live` | 有 NOTION_API_KEY（預設） | 讀寫主庫 | 正常登入／起飛／降落 |

檢查：`GET /api/config` → `{ dataMode, notionReady, hint }`

---

### 可以改、不要動

| ✅ 各組可改 | ❌ 寫入主庫時不可改 |
|---|---|
| `public/index.html`、`style.css`、`app.js` 文案與版面 | `dashboard-schema.ts` 欄位**名稱** |
| `src/lib/ai/scenery.ts` 生圖 prompt | Select 選項值（須用 `group_01` 等內建值） |
| 廣播語氣、OpenAI 設定 | Flight Log 一列一航班的資料模型 |
| 自己的 Vercel domain | 把資料寫到非主辦 DB |

---

欄位順序建議（Notion UI 手動拖曳）與 `DASHBOARD_PROPERTY_ORDER` 相同。

---

## 識別

| 欄位名稱 | Notion 型別 | 必填 | 說明 |
|---|---|---|---|
| **Flight ID** | Title | ✅ | 主鍵；API 查詢用。例：`FL-A-MQV5DGNF` |
| Passenger ID | Text | ✅ | 與網站登入 ID 完全一致 |
| Name | Text | ✅ | 乘客姓名（看板顯示） |
| Group ID | Select | ✅ | 見下方「Group ID」 |
| Status | Select | ✅ | 見下方「Status」 |

### Group ID（只能選這五個）

```
group_01
group_02
group_03
group_04
group_05
```

### Status

| 值 | 意義 | 何時使用 |
|---|---|---|
| `not_started` | 未起飛 | Schema 有；正常流程較少手動建 |
| `in_flight` | 飛行中 | 起飛後；同乘客不可重複 |
| `landed` | 已降落 | 降落後；生風景圖必要 |

---

## 起飛

| 欄位名稱 | 型別 | 必填 | 說明 |
|---|---|---|---|
| Departure Location | Text | 起飛後必填 | 例：`Taipei, Taiwan` |
| Departure Latitude | Number | 建議 | 小數，例：`25.033` |
| Departure Longitude | Number | 建議 | 小數，例：`121.5654` |
| Takeoff Time | Date | 起飛後必填 | 含時間；ISO 或 Notion date |
| Takeoff Broadcast Style | Select | 選填 | 見「Broadcast Style」 |
| Takeoff Broadcast | Text | 選填 | 起飛廣播全文 |
| Route Direction | Select | 建議 | 見下方 |
| Direction Source | Select | 建議 | 見下方 |
| Direction Note | Text | 選填 | 方向備註 |

### Route Direction

```
auto
eastbound
westbound
northbound
southbound
northeast
northwest
southeast
southwest
circular
unknown
```

### Direction Source

```
system_auto
participant_design
mood_input
weather_input
team_signal
physical_interaction
random_card
future_body_data
```

---

## 降落

| 欄位名稱 | 型別 | 必填 | 說明 |
|---|---|---|---|
| Landing Time | Date | landed 必填 | 降落時間 |
| Flight Duration Minutes | Number | 選填 | 整數分鐘 |
| Estimated Flight Distance KM | Number | 選填 | 整數公里 |
| **Arrival Location** | Text | **landed 必填** | **`城市, 國家`** — 風景生圖與顯示用 |
| Arrival Latitude | Number | landed 建議 | 抵達地緯度 |
| Arrival Longitude | Number | landed 建議 | 抵達地經度 |
| Captain Broadcast Style | Select | 選填 | 見「Broadcast Style」 |
| Captain Broadcast | Text | 選填 | 降落廣播全文 |

### Arrival Location 格式（重要）

程式用逗號分割 city / country：

| ✅ 正確 | ❌ 避免 |
|---|---|
| `Naga, Philippines` | `Naga`（缺國家） |
| `Sātkania, Bangladesh` | `孟加拉國萨特坎尼亚`（中文） |
| `Tokyo, Japan` | `Japan - Tokyo`（非標準） |

---

## 社交

| 欄位名稱 | 型別 | 說明 |
|---|---|---|
| Social Cue Type | Select | 見下方 |
| Social Cue Text | Text | 社交提示文案 |
| Related Passenger | Text | 相關乘客姓名或 ID |

### Social Cue Type

```
same_sky
same_region
nearby_region
relay_flight
early_landing
late_landing
solo
```

---

## 系統

| 欄位名稱 | 型別 | 說明 |
|---|---|---|
| Created At | Date | 列建立時間 |
| Updated At | Date | 最後更新時間 |

---

## Broadcast Style（起飛／降落共用）

```
formal_captain
poetic
playful
flight_attendant
radio_host
custom
```

---

# Sleep Airline Landing Scenery — 欄位參考

**通常勿手動新增。** 降落或 backfill 時由程式寫入。

| 欄位名稱 | 型別 | 說明 |
|---|---|---|
| Entry ID | Title | `SC-{Flight ID}` |
| Flight ID | Text | **必須與 Flight Log 同一趟** |
| Passenger ID | Text | 同主庫 |
| Name | Text | 同主庫 |
| Group ID | Select | 同主庫 `group_0X` |
| Arrival Location | Text | 同主庫 |
| Country | Text | 由 Arrival Location 解析 |
| Image | Files | 程式上傳 |
| Image URL | URL | 程式回填 |
| Image Prompt | Text | 生圖 prompt（英文） |
| Landing Time | Date | 同主庫 |
| Created At | Date | 建立時間 |

查詢風景：依 **Flight ID**（Text）找最新一筆。

---

## 填寫範例（landed 人工補登）

| 欄位 | 值 |
|---|---|
| Flight ID | `FL-MORGAN-MQV56IO3` |
| Passenger ID | `MORGAN` |
| Name | `Morgan` |
| Group ID | `group_02` |
| Status | `landed` |
| Departure Location | `Taipei, Taiwan` |
| Departure Latitude | `25.033` |
| Departure Longitude | `121.5654` |
| Takeoff Time | `2026-06-26 22:00` |
| Landing Time | `2026-06-27 06:30` |
| Flight Duration Minutes | `510` |
| Estimated Flight Distance KM | `2800` |
| Arrival Location | `Naga, Philippines` |
| Arrival Latitude | `13.619` |
| Arrival Longitude | `123.181` |
| Route Direction | `auto` |
| Direction Source | `system_auto` |
| Created At | `2026-06-26 22:00` |
| Updated At | `2026-06-27 06:30` |

補圖：

```bash
curl -X POST https://sleep-airline-s2.vercel.app/api/scenery/backfill \
  -H "Content-Type: application/json" \
  -d '{"flightIds":["FL-MORGAN-MQV56IO3"],"force":true}'
```

---

## 環境變數（給工程師）

| 變數 | 用途 | Fork 注意 |
|---|---|---|
| `NOTION_API_KEY` | 必填 | Integration 須能 edit **主庫** |
| `NOTION_DASHBOARD_DB_ID` | Flight Log | **必填** — 用主辦提供的 ID |
| `NOTION_LANDSCAPE_DB_ID` | Landing Scenery | 用主辦提供的 ID（生圖時） |
| `NOTION_PARENT_PAGE_ID` | 自動尋表／建表 | Fork **勿依賴**；避免建出孤島庫 |
| `OPENAI_API_KEY` | 廣播／生圖 | 各組可用自己的 key |
| `OPENAI_IMAGE_MODEL` | 生圖模型 | 選填，預設 `gpt-image-1-mini` |
