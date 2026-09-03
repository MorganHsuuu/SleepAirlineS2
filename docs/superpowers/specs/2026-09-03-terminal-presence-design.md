# Terminal 候機狀態設計

## 目標

使用者登入並設定頭像後，即使尚未起飛，同隊成員也能在小隊動態看見其「候機中」狀態。只有真正起飛才建立 Flight Log，候機資料不得寫入共用 Notion 航班主庫。

## 資料邊界

- Flight Log 繼續只保存真實起飛後的航班。
- 候機資料獨立存放在 Vercel Marketplace 的 Upstash Redis。
- 每筆候機資料包含：`passengerId`、`passengerName`、`groupId`、`idPhotoUrl`、`checkedInAt`、`updatedAt`。
- Redis 可接受前端壓縮後的頭像 Data URL；不把 Redis token 暴露到瀏覽器。
- 使用 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，並相容 Vercel 舊式 `KV_REST_API_URL` / `KV_REST_API_TOKEN`。
- 登入成功後由伺服器簽發綁定 `passengerId` / `groupId`、24 小時有效的 HMAC presence session token。簽章優先使用 `PRESENCE_SESSION_SECRET`，未設定時回退到僅存在伺服器端的 Redis token；Redis 未設定時不簽發。
- presence session token 只保存在前端記憶體，不寫入 localStorage、Notion 或 Redis。

## 後端流程

1. 登入成功後 upsert 候機資料。
2. 更新頭像後同步更新候機資料。
3. 小隊看板讀取同組候機資料。
4. 起飛成功後刪除該乘客的候機資料。
5. 登出時呼叫 API 刪除候機資料。

Redis 未設定或請求失敗時採 fail-open：登入、起飛、降落與 Notion Flight Log 均維持正常，只略過跨裝置候機狀態。

## API 與前端

- `POST /api/presence/check-in`：登入後或頭像更新後寫入候機狀態。
- `POST /api/presence/check-out`：起飛或登出時移除候機狀態。
- check-in 成功回 200；群組容量已滿回 409；Redis timeout／故障回 503。這些回應不改變登入或航班主流程。
- `GET /api/board`：回傳原有 `flights`，另加 `waitingPassengers`，不改既有欄位契約。
- 登入後初次 check-in 失敗時只在 750ms 後重試一次；正式環境不自行補造候機列，本機 workshop 模式則保留 localStorage 模擬。
- 候機者若已有飛行中航班，以飛行中為優先；否則候機列取代同一人的舊降落列。
- 候機列顯示頭像、名稱、「候機中」與登入時間；不可點進航班詳情、不可出現在地球航線或夜空留言區。
- 起飛後候機列立即消失，由正式「飛行中」航班列取代。

## 安全與一致性

- 後端驗證乘客、小隊與圖片格式並限制頭像大小。
- 每位候機者使用獨立 member key（24 小時 TTL），每組另有 set index（48 小時 TTL）。
- 原子寫入先移除 index 中已過期的 member，再執行容量檢查與 upsert；checkout 原子執行 `DEL + SREM`。
- 看板清理只在 Lua 再次確認 member 不存在後移除 index，避免刪除並行重新登入的新資料。
- check-in / check-out 驗證 HMAC session，再以 `req.ip` 加乘客身分套用 Redis 限流。
- 候機狀態不使用週期性心跳。
- 正常登出或起飛時立即刪除；異常關閉由 24 小時期限清理。
- 不修改共用 Notion schema，也不把候機行為納入研究 Flight Log。

## 驗證

- 登入後，同隊 API 可讀到候機者；不同小隊互不可見。
- 有頭像時顯示頭像，沒有時使用姓名首字。
- 起飛與登出後候機資料消失，候機者不產生 Flight Log。
- Redis 未設定或故障時，既有登入與飛行流程不受影響。
- 工作坊契約檢查與正式建置通過。

## 登入模型邊界

既有 Passenger ID 登入沒有密碼或帳號驗證。HMAC session 可阻止未先完成登入流程的盲目 check-in / check-out，但無法阻止他人冒用相同 Passenger ID 重新登入；完整帳號驗證不納入本功能。
