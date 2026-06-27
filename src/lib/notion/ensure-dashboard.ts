import type { Client } from '@notionhq/client';
import { DASHBOARD_TITLE, DEFAULT_PARENT_PAGE_ID, getDashboardProperties, normalizeNotionId } from './dashboard-schema';
import { getNotionClient } from './client';

let cachedDbId: string | null = null;
let resolving: Promise<string> | null = null;

function getParentPageId(): string {
  const raw = process.env.NOTION_PARENT_PAGE_ID ?? DEFAULT_PARENT_PAGE_ID;
  return normalizeNotionId(raw);
}

async function readDatabaseTitle(client: Client, databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const title = (db as { title?: { plain_text: string }[] }).title;
  return title?.[0]?.plain_text ?? '';
}

async function findDashboardOnPage(client: Client, parentPageId: string): Promise<string | null> {
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: parentPageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      const typed = block as { type?: string; id?: string };
      if (typed.type !== 'child_database' || !typed.id) continue;
      const title = await readDatabaseTitle(client, typed.id);
      if (title === DASHBOARD_TITLE) return typed.id;
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

async function createDashboard(client: Client, parentPageId: string): Promise<string> {
  const db = await client.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: DASHBOARD_TITLE } }],
    properties: getDashboardProperties(),
  });
  return db.id;
}

/** 學生用「自己的」父頁面（非主辦預設頁面）時，視為自己的 Notion 空間。 */
function isOwnWorkspace(): boolean {
  return getParentPageId() !== normalizeNotionId(DEFAULT_PARENT_PAGE_ID);
}

/**
 * 是否允許本程式建立 / 修改資料庫結構。
 * - 主辦論文主庫（預設父頁面）：永遠鎖死；只有臨時設 NOTION_ALLOW_SCHEMA_WRITE=true 才開（主辦首建用）。
 * - 學生用自己的父頁面：視為自己的空間，自動允許建表，學生免設任何額外旗標。
 */
function canWriteSchema(): boolean {
  return process.env.NOTION_ALLOW_SCHEMA_WRITE === 'true' || isOwnWorkspace();
}

async function findOrCreateDashboard(): Promise<string> {
  const client = getNotionClient();

  // 直接指定主庫 ID：只認 ID，絕不更動 schema。
  if (process.env.NOTION_DASHBOARD_DB_ID) {
    return normalizeNotionId(process.env.NOTION_DASHBOARD_DB_ID);
  }

  const parentPageId = getParentPageId();

  // 找到既有的共用主庫就直接用，不做任何 schema 更動。
  const existing = await findDashboardOnPage(client, parentPageId);
  if (existing) return existing;

  // 找不到主庫：除非明確允許建表，否則報錯，避免學生意外建出平行表污染數據。
  if (!canWriteSchema()) {
    throw new Error(
      '找不到共用主資料庫「Sleep Airline Flight Log」。' +
      '學生部署不應自動建表；請確認 NOTION_API_KEY 與父頁面設定正確。'
    );
  }

  try {
    return await createDashboard(client, parentPageId);
  } catch {
    const retry = await findDashboardOnPage(client, parentPageId);
    if (retry) return retry;
    throw new Error('無法在 Notion 父頁面建立 Dashboard，請確認 Integration 已 Connect。');
  }
}

/** 取得 Dashboard DB ID；若未設定 NOTION_DASHBOARD_DB_ID 則在父頁面自動尋找或建立。 */
export async function resolveDashboardDbId(): Promise<string> {
  if (cachedDbId) return cachedDbId;

  if (!resolving) {
    resolving = findOrCreateDashboard()
      .then((id) => {
        cachedDbId = id;
        return id;
      })
      .finally(() => {
        resolving = null;
      });
  }

  return resolving;
}
