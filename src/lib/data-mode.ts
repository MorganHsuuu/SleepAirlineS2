export type DataMode = 'preview' | 'live';

/**
 * preview — 不寫 Notion，供 fork 改 UI；API 用記憶體（本地 dev 可跑完整流程）。
 * live    — 寫入主辦 Notion 主庫（需 NOTION_API_KEY + DB ID）。
 *
 * 未設定 SLEEP_AIRLINE_DATA_MODE 時：
 *   有 NOTION_API_KEY → live（維持主辦現有部署行為）
 *   無 NOTION_API_KEY → preview
 */
export function getDataMode(): DataMode {
  const raw = process.env.SLEEP_AIRLINE_DATA_MODE?.trim().toLowerCase();
  if (raw === 'preview') return 'preview';
  if (raw === 'live') return 'live';
  return process.env.NOTION_API_KEY ? 'live' : 'preview';
}

export function isLiveDataMode(): boolean {
  return getDataMode() === 'live';
}

export function getDataModeStatus(): {
  dataMode: DataMode;
  notionConfigured: boolean;
  notionReady: boolean;
  hint: string;
} {
  const dataMode = getDataMode();
  const hasKey = !!process.env.NOTION_API_KEY;
  const hasDashboardId = !!process.env.NOTION_DASHBOARD_DB_ID;
  const notionConfigured = dataMode === 'live' && hasKey;
  const notionReady = notionConfigured && hasDashboardId;

  let hint: string;
  if (dataMode === 'preview') {
    hint = '預覽模式：可改 UI／走假資料預覽，資料不會寫入 Notion。接上主庫後設 SLEEP_AIRLINE_DATA_MODE=live 並 redeploy。';
  } else if (!hasKey) {
    hint = 'live 模式但未設定 NOTION_API_KEY，請在 Vercel 補上環境變數。';
  } else if (!hasDashboardId) {
    hint = '已設定 API Key；建議一併設定 NOTION_DASHBOARD_DB_ID 指向主辦主庫，避免自動建表。';
  } else {
    hint = '已連線主庫，起飛／降落會寫入 Notion。';
  }

  return { dataMode, notionConfigured, notionReady, hint };
}
