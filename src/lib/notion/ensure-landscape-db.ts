import type { Client } from '@notionhq/client';
import {
  DEFAULT_PARENT_PAGE_ID,
  LANDSCAPE_DB_TITLE,
  getLandscapeProperties,
  normalizeNotionId,
} from './landscape-schema';
import { getNotionClient } from './client';

let cachedDbId: string | null = null;
let resolving: Promise<string> | null = null;

function getParentPageId(): string {
  const raw = process.env.NOTION_PARENT_PAGE_ID ?? DEFAULT_PARENT_PAGE_ID;
  return normalizeNotionId(raw);
}

/** 學生用「自己的」父頁面（非主辦預設頁面）時，視為自己的 Notion 空間。 */
function isOwnWorkspace(): boolean {
  return getParentPageId() !== normalizeNotionId(DEFAULT_PARENT_PAGE_ID);
}

/** 主辦預設頁面永遠鎖死（除非 NOTION_ALLOW_SCHEMA_WRITE=true）；自己的頁面自動允許建表。 */
function canWriteSchema(): boolean {
  return process.env.NOTION_ALLOW_SCHEMA_WRITE === 'true' || isOwnWorkspace();
}

async function readDatabaseTitle(client: Client, databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const title = (db as { title?: { plain_text: string }[] }).title;
  return title?.[0]?.plain_text ?? '';
}

async function findLandscapeOnPage(client: Client, parentPageId: string): Promise<string | null> {
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
      if (title === LANDSCAPE_DB_TITLE) return typed.id;
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

async function createLandscapeDb(client: Client, parentPageId: string): Promise<string> {
  const db = await client.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: LANDSCAPE_DB_TITLE } }],
    properties: getLandscapeProperties(),
  });
  return db.id;
}

async function findOrCreateLandscapeDb(): Promise<string> {
  const client = getNotionClient();

  // 直接指定：只認 ID，絕不更動 schema。
  if (process.env.NOTION_LANDSCAPE_DB_ID) {
    return normalizeNotionId(process.env.NOTION_LANDSCAPE_DB_ID);
  }

  const parentPageId = getParentPageId();

  // 找到既有的共用資料庫就直接用，不做任何 schema 更動。
  const existing = await findLandscapeOnPage(client, parentPageId);
  if (existing) return existing;

  // 主辦預設頁面找不到就報錯（保護論文庫）；自己的頁面則往下自動建表。
  if (!canWriteSchema()) {
    throw new Error(
      '找不到共用資料庫「Sleep Airline Landing Scenery」。' +
      '學生部署不應在主辦頁面建表；請確認 Notion 設定正確。'
    );
  }

  try {
    return await createLandscapeDb(client, parentPageId);
  } catch {
    const retry = await findLandscapeOnPage(client, parentPageId);
    if (retry) return retry;
    throw new Error('無法在 Notion 父頁面建立 Landing Scenery 資料庫，請確認 Integration 已 Connect。');
  }
}

export async function resolveLandscapeDbId(): Promise<string> {
  if (cachedDbId) return cachedDbId;

  if (!resolving) {
    resolving = findOrCreateLandscapeDb()
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
