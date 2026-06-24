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

async function syncDashboardSchema(client: Client, databaseId: string): Promise<void> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const existing = Object.keys((db as { properties?: Record<string, unknown> }).properties ?? {});
  const wanted = getDashboardProperties();
  const missing: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(wanted)) {
    if (!existing.includes(key)) missing[key] = def;
  }
  if (Object.keys(missing).length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.databases.update({ database_id: databaseId, properties: missing as any });
}

async function findOrCreateDashboard(): Promise<string> {
  const client = getNotionClient();

  if (process.env.NOTION_DASHBOARD_DB_ID) {
    const id = normalizeNotionId(process.env.NOTION_DASHBOARD_DB_ID);
    await syncDashboardSchema(client, id);
    return id;
  }

  const parentPageId = getParentPageId();

  const existing = await findDashboardOnPage(client, parentPageId);
  if (existing) {
    await syncDashboardSchema(client, existing);
    return existing;
  }

  try {
    return await createDashboard(client, parentPageId);
  } catch {
    const retry = await findDashboardOnPage(client, parentPageId);
    if (retry) {
      await syncDashboardSchema(client, retry);
      return retry;
    }
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
