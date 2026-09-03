import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_TTL_SECONDS = 24 * 60 * 60;

interface PresenceSessionPayload {
  passengerId: string;
  groupId: string;
  expiresAt: number;
}

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return url && token ? { url, token } : null;
}

function sessionSecret(): string | null {
  const redis = redisConfig();
  if (!redis) return null;
  return process.env.PRESENCE_SESSION_SECRET || redis.token;
}

function validIdentity(passengerId: string, groupId: string): boolean {
  return !!passengerId
    && passengerId.length <= 120
    && !/[\u0000-\u001f\u007f]/.test(passengerId)
    && (/^\d{4}$/.test(groupId) || /^group_\d{2}$/i.test(groupId));
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function issuePresenceSessionToken(
  passengerId: string,
  groupId: string,
  now: Date = new Date()
): string | null {
  const secret = sessionSecret();
  if (!secret || !validIdentity(passengerId, groupId)) return null;
  const payload: PresenceSessionPayload = {
    passengerId,
    groupId,
    expiresAt: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`;
}

export function verifyPresenceSessionToken(
  token: unknown,
  passengerId: string,
  groupId: string,
  now: Date = new Date()
): boolean {
  const secret = sessionSecret();
  if (!secret || typeof token !== 'string' || !validIdentity(passengerId, groupId)) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = signature(parts[0], secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as PresenceSessionPayload;
    return payload.passengerId === passengerId
      && payload.groupId === groupId
      && Number.isInteger(payload.expiresAt)
      && Math.floor(now.getTime() / 1000) < payload.expiresAt;
  } catch {
    return false;
  }
}
