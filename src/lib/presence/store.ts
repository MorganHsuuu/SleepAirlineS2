import { createHash } from 'crypto';

export interface WaitingPassenger {
  passengerId: string;
  passengerName: string;
  groupId: string;
  idPhotoUrl: string | null;
  checkedInAt: string;
  updatedAt: string;
}

export type PresenceCheckInResult =
  | { status: 'saved'; waitingPassenger: WaitingPassenger }
  | { status: 'capacity' }
  | { status: 'unavailable' };

export type PresenceCheckOutResult =
  | { status: 'removed' }
  | { status: 'unavailable' };

const KEY_PREFIX = 'sleep-airline:presence:v2:';
const MEMBER_TTL_SECONDS = 24 * 60 * 60;
const INDEX_TTL_SECONDS = 48 * 60 * 60;
const MAX_AVATAR_DATA_URL_LENGTH = 50_000;
const MAX_GROUP_PRESENCE = 100;
const MAX_WRITES_PER_MINUTE = 60;
const UPSERT_PRESENCE_LUA = [
  `local indexed = redis.call('SMEMBERS', KEYS[1])`,
  `for _, member in ipairs(indexed) do`,
  `  if redis.call('EXISTS', member) == 0 then redis.call('SREM', KEYS[1], member) end`,
  `end`,
  `local exists = redis.call('EXISTS', KEYS[2])`,
  `if exists == 0 and redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end`,
  `redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[3]))`,
  `redis.call('SADD', KEYS[1], KEYS[2])`,
  `redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))`,
  `return 1`,
].join('\n');
const REMOVE_PRESENCE_LUA = [
  `redis.call('DEL', KEYS[2])`,
  `redis.call('SREM', KEYS[1], KEYS[2])`,
  `return 1`,
].join('\n');
const PRUNE_MISSING_INDEX_LUA = [
  `for index = 2, #KEYS do`,
  `  if redis.call('EXISTS', KEYS[index]) == 0 then`,
  `    redis.call('SREM', KEYS[1], KEYS[index])`,
  `  end`,
  `end`,
  `return 1`,
].join('\n');
const RATE_LIMIT_LUA = [
  `local count = redis.call('INCR', KEYS[1])`,
  `if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end`,
  `return count`,
].join('\n');

function presenceConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function isPresenceConfigured(): boolean {
  return presenceConfig() !== null;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validPassengerId(passengerId: string): boolean {
  return !!passengerId && !/[\u0000-\u001f\u007f]/.test(passengerId);
}

function validGroupId(groupId: string): boolean {
  return /^\d{4}$/.test(groupId) || /^group_\d{2}$/i.test(groupId);
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

function normalizeAvatar(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const avatar = value.trim();
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(avatar)) {
    return avatar.length <= MAX_AVATAR_DATA_URL_LENGTH ? avatar : null;
  }
  if (!/^https:\/\//i.test(avatar)) return null;
  try {
    const host = new URL(avatar).hostname.toLowerCase();
    const trusted = /^prod-files-secure\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host)
      || host === 'secure.notion-static.com'
      || host.endsWith('.notionusercontent.com');
    return trusted ? avatar.slice(0, 4096) : null;
  } catch {
    return null;
  }
}

export function normalizeWaitingPassenger(
  input: unknown,
  now: Date = new Date()
): WaitingPassenger | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const passengerId = cleanString(data.passengerId, 120);
  const passengerName = cleanString(data.passengerName ?? data.name, 80);
  const groupId = cleanString(data.groupId, 24);
  if (!validPassengerId(passengerId) || !passengerName || !validGroupId(groupId)) return null;
  const nowIso = now.toISOString();
  return {
    passengerId,
    passengerName,
    groupId,
    idPhotoUrl: normalizeAvatar(data.idPhotoUrl),
    checkedInAt: nowIso,
    updatedAt: nowIso,
  };
}

async function redisCommand(command: Array<string | number>): Promise<unknown> {
  const config = presenceConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Upstash Redis ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

function indexKey(groupId: string): string {
  return `${KEY_PREFIX}group:${groupId}`;
}

function memberKey(groupId: string, passengerId: string): string {
  const digest = createHash('sha256').update(passengerId).digest('hex').slice(0, 24);
  return `${KEY_PREFIX}member:${groupId}:${digest}`;
}

export async function checkInPassenger(input: unknown): Promise<PresenceCheckInResult> {
  const waitingPassenger = normalizeWaitingPassenger(input);
  if (!waitingPassenger || !isPresenceConfigured()) return { status: 'unavailable' };
  try {
    const result = await redisCommand([
      'EVAL',
      UPSERT_PRESENCE_LUA,
      2,
      indexKey(waitingPassenger.groupId),
      memberKey(waitingPassenger.groupId, waitingPassenger.passengerId),
      JSON.stringify(waitingPassenger),
      MAX_GROUP_PRESENCE,
      MEMBER_TTL_SECONDS,
      INDEX_TTL_SECONDS,
    ]);
    return Number(result) === 1
      ? { status: 'saved', waitingPassenger }
      : { status: 'capacity' };
  } catch (error) {
    console.warn('[presence check-in]', error);
    return { status: 'unavailable' };
  }
}

export async function checkOutPassenger(
  groupId: string,
  passengerId: string
): Promise<PresenceCheckOutResult> {
  const cleanGroup = cleanString(groupId, 24);
  const cleanPassenger = cleanString(passengerId, 120);
  if (!validGroupId(cleanGroup) || !validPassengerId(cleanPassenger) || !isPresenceConfigured()) {
    return { status: 'unavailable' };
  }
  try {
    await redisCommand([
      'EVAL',
      REMOVE_PRESENCE_LUA,
      2,
      indexKey(cleanGroup),
      memberKey(cleanGroup, cleanPassenger),
    ]);
    return { status: 'removed' };
  } catch (error) {
    console.warn('[presence check-out]', error);
    return { status: 'unavailable' };
  }
}

function parseStoredPassenger(raw: unknown, groupId: string): WaitingPassenger | null {
  try {
    const data = JSON.parse(String(raw)) as WaitingPassenger;
    const checkedInAt = validIso(data.checkedInAt);
    const updatedAt = validIso(data.updatedAt);
    if (!checkedInAt || !updatedAt) return null;
    const normalized = normalizeWaitingPassenger(data, new Date(updatedAt));
    if (!normalized || normalized.groupId !== groupId) return null;
    return { ...normalized, checkedInAt, updatedAt };
  } catch {
    return null;
  }
}

export async function getWaitingPassengers(groupId: string): Promise<WaitingPassenger[]> {
  const cleanGroup = cleanString(groupId, 24);
  if (!validGroupId(cleanGroup) || !isPresenceConfigured()) return [];
  try {
    const groupIndexKey = indexKey(cleanGroup);
    const memberKeys = await redisCommand(['SMEMBERS', groupIndexKey]);
    if (!Array.isArray(memberKeys) || memberKeys.length === 0) return [];
    const boundedKeys = memberKeys.slice(0, MAX_GROUP_PRESENCE).map(String);
    const values = await redisCommand(['MGET', ...boundedKeys]);
    if (!Array.isArray(values)) return [];

    const entries: WaitingPassenger[] = [];
    const missingKeys: string[] = [];
    for (let index = 0; index < boundedKeys.length; index += 1) {
      const entry = parseStoredPassenger(values[index], cleanGroup);
      if (entry && memberKey(cleanGroup, entry.passengerId) === boundedKeys[index]) {
        entries.push(entry);
      } else if (values[index] == null) {
        missingKeys.push(boundedKeys[index]);
      }
    }
    if (missingKeys.length) {
      try {
        await redisCommand([
          'EVAL',
          PRUNE_MISSING_INDEX_LUA,
          missingKeys.length + 1,
          groupIndexKey,
          ...missingKeys,
        ]);
      } catch (error) {
        console.warn('[presence stale cleanup]', error);
      }
    }
    return entries.sort((a, b) => Date.parse(b.checkedInAt) - Date.parse(a.checkedInAt));
  } catch (error) {
    console.warn('[presence list]', error);
    return [];
  }
}

export async function allowPresenceWrite(identifier: string): Promise<boolean> {
  if (!isPresenceConfigured()) return true;
  const digest = createHash('sha256').update(identifier || 'unknown').digest('hex').slice(0, 24);
  try {
    const count = await redisCommand([
      'EVAL',
      RATE_LIMIT_LUA,
      1,
      `${KEY_PREFIX}rate:${digest}`,
      60,
    ]);
    return Number(count) <= MAX_WRITES_PER_MINUTE;
  } catch {
    return true;
  }
}
