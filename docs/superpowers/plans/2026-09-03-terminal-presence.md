# Terminal Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 登入後讓同隊成員看見候機頭像，並確保只有起飛才寫入 Flight Log。

**Architecture:** 使用 Upstash Redis REST 的每乘客 24 小時 TTL member key與 48 小時 group index 儲存候機狀態。登入後簽發 24 小時 HMAC session；看板合併候機者與航班，起飛或登出時清除候機資料。

**Tech Stack:** TypeScript、Express、Upstash Redis REST、原生瀏覽器 JavaScript、Notion Flight Log

---

### Task 1：Presence session 與 Redis store

**Files:**
- Create: `src/lib/presence/session.ts`
- Create: `src/lib/presence/store.ts`
- Test: `scripts/check-terminal-presence-store.ts`

- [x] 先建立失敗測試，涵蓋 HMAC 有效、竄改、過期及身分不符。
- [x] 實作 24 小時 HMAC session，token 僅留前端記憶體。
- [x] 實作 member TTL、group index、原子 stale prune、容量限制、checkout 與 IP 限流。
- [x] 測試並行重新 check-in 不會被舊清理刪除。
- [x] 驗證 Redis timeout 與故障時 fail-open。

### Task 2：Presence API 與 Flight Log 邊界

**Files:**
- Modify: `server.ts`
- Test: `scripts/check-terminal-presence-api.mjs`

- [x] 登入成功後簽發綁定乘客及小隊的 presence token。
- [x] 新增 `POST /api/presence/check-in` 與 `POST /api/presence/check-out`。
- [x] 驗證 token 與限流，分別回傳成功、容量已滿及 Redis 不可用狀態。
- [x] `GET /api/board` 平行回傳 `flights` 與 `waitingPassengers`。
- [x] 起飛成功後由後端清除候機狀態。
- [x] 確認登入流程不建立 Flight Log，Notion schema 未變更。

### Task 3：前端候機生命週期與顯示

**Files:**
- Modify: `public/app.js`
- Modify: `public/workshop-local.js`
- Modify: `public/i18n.js`
- Modify: `public/style.css`
- Test: `scripts/check-terminal-presence-ui.mjs`

- [x] 登入後 check-in；失敗只於 750ms 後重試一次，不使用心跳。
- [x] 頭像更新後同步候機資料。
- [x] 起飛或登出時清除候機資料及記憶體 token。
- [x] 合併候機者、飛行中及舊降落列，飛行中優先、候機取代舊降落。
- [x] 候機列不可點進航班詳情，也不加入地球航跡或夜空留言。
- [x] 本機 workshop 模式使用 localStorage 模擬並套用相同資料限制。
- [x] 加入中英文「候機中」文案及樣式。

### Task 4：驗證與部署文件

**Files:**
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `api/index.js`
- Modify: `api/index.js.map`

- [x] 記錄 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN` 及選填的 `PRESENCE_SESSION_SECRET`。
- [x] 執行 `npm run check:presence`。
- [x] 執行 `npm run check:contract`。
- [x] 執行 `npm run build` 與 `git diff --check`。
- [x] 確認未納入 `.DS_Store`、圖片、個人設定檔或 Notion schema 變更。
