# 主辦 Notion 連線（內部）

## 檔案／風景庫

| 用途 | env 變數 | Database ID |
|---|---|---|
| Flight Log 航班總表 | `NOTION_DASHBOARD_DB_ID` | （向主辦既有總表） |
| **Landing Scenery 風景圖／檔案** | `NOTION_LANDSCAPE_DB_ID` | `38e65082791780178da6000c4343c38b` |

程式會把降落生成的風景圖上傳到 **Landing Scenery** 的 `Image` 欄位（見 `src/lib/notion/landscape-images.ts`）。

## Vercel 設定（主辦 production）

1. 開 [Vercel](https://vercel.com) → **Sleep Airline S2** → Settings → Environment Variables  
2. 設定或更新：
   ```
   NOTION_LANDSCAPE_DB_ID=38e65082791780178da6000c4343c38b
   ```
3. **Redeploy**

## Notion Integration 必做

在新資料庫頁面：

1. 右上角 **⋯** → **Connections**  
2. 加入你的 Integration（與 `NOTION_API_KEY` 同一個）  
3. 確認資料庫標題建議為 **Sleep Airline Landing Scenery**（欄位見 `src/lib/notion/landscape-schema.ts`）

## 驗收

```bash
# 本機 .env.local 填好 NOTION_API_KEY + 兩個 DB ID 後
npm run notion:verify
```

或部署後：

- `GET https://sleep-airline-s2.vercel.app/api/notion/schema` → `landingScenery.databaseId` 應為上述 ID  
- 降落一次 → 此表出現新列且 `Image` 有檔案

## 分發給學員（Phase 3）

三項 env 都要給；`NOTION_LANDSCAPE_DB_ID` 固定用：

```
38e65082791780178da6000c4343c38b
```
