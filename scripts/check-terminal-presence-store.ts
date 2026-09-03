import assert from 'node:assert/strict';
import {
  allowPresenceWrite,
  checkInPassenger,
  checkOutPassenger,
  getWaitingPassengers,
  isPresenceConfigured,
  normalizeWaitingPassenger,
} from '../src/lib/presence/store';
import {
  issuePresenceSessionToken,
  verifyPresenceSessionToken,
} from '../src/lib/presence/session';

const now = new Date('2026-09-03T08:00:00.000Z');
const avatar = 'data:image/jpeg;base64,abc123';
const valid = normalizeWaitingPassenger({
  passengerId: 'p_0001_morgan',
  passengerName: 'Morgan',
  groupId: '0001',
  idPhotoUrl: avatar,
  checkedInAt: '2099-01-01T00:00:00.000Z',
}, now);

assert.ok(valid);
const validPassenger = valid;
assert.equal(valid.checkedInAt, now.toISOString(), 'checkedInAt 必須使用伺服器時間');
assert.equal(valid.updatedAt, now.toISOString());
assert.equal(valid.idPhotoUrl, avatar);
assert.equal(normalizeWaitingPassenger({
  passengerId: 'bad',
  passengerName: 'Bad',
  groupId: 'not-a-terminal',
}, now), null);
assert.equal(normalizeWaitingPassenger({
  passengerId: 'large',
  passengerName: 'Large',
  groupId: '0001',
  idPhotoUrl: `data:image/jpeg;base64,${'a'.repeat(50_001)}`,
}, now)?.idPhotoUrl, null);

const envKeys = [
  'PRESENCE_SESSION_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
] as const;

async function withPresenceEnv(run: () => Promise<void>) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  try {
    for (const key of envKeys) delete process.env[key];
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function checkSessionTokens() {
  await withPresenceEnv(async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://presence.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-secret';
    process.env.PRESENCE_SESSION_SECRET = 'dedicated-session-secret';

    const token = issuePresenceSessionToken('p_0001_morgan', '0001', now);
    assert.ok(token);
    assert.equal(verifyPresenceSessionToken(token, 'p_0001_morgan', '0001', now), true);
    assert.equal(verifyPresenceSessionToken(`${token.slice(0, -1)}x`, 'p_0001_morgan', '0001', now), false);
    assert.equal(verifyPresenceSessionToken(token, 'another-passenger', '0001', now), false);
    assert.equal(verifyPresenceSessionToken(token, 'p_0001_morgan', '0002', now), false);
    assert.equal(
      verifyPresenceSessionToken(token, 'p_0001_morgan', '0001', new Date(now.getTime() + 86_400_001)),
      false
    );

    delete process.env.PRESENCE_SESSION_SECRET;
    const fallbackToken = issuePresenceSessionToken('p_0001_morgan', '0001', now);
    assert.ok(fallbackToken, '未設獨立 secret 時應安全回退到 server-side Redis token');

    delete process.env.UPSTASH_REDIS_REST_URL;
    assert.equal(issuePresenceSessionToken('p_0001_morgan', '0001', now), null);
  });
}

type Member = { value: string; ttl: number };

async function checkRedisMemberStore() {
  await withPresenceEnv(async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://presence.example/';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    const members = new Map<string, Member>();
    const indexes = new Map<string, Set<string>>();
    const indexTtls = new Map<string, number>();
    const rateCounts = new Map<string, number>();
    const commands: unknown[][] = [];
    let rewriteAfterMget: { key: string; value: string } | null = null;

    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'https://presence.example');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
      const command = JSON.parse(String(init?.body)) as string[];
      commands.push(command);
      let result: unknown = 1;

      if (command[0] === 'EVAL' && command[1].includes('SADD')) {
        const script = command[1];
        const indexKey = command[3];
        const memberKey = command[4];
        const value = command[5];
        const max = Number(command[6]);
        const memberTtl = Number(command[7]);
        const indexTtl = Number(command[8]);
        const index = indexes.get(indexKey) ?? new Set<string>();
        for (const indexed of [...index]) {
          if (!members.has(indexed)) index.delete(indexed);
        }
        if (!members.has(memberKey) && index.size >= max) {
          result = 0;
        } else {
          members.set(memberKey, { value, ttl: memberTtl });
          index.add(memberKey);
          indexes.set(indexKey, index);
          indexTtls.set(indexKey, indexTtl);
        }
        assert.ok(script.indexOf('EXISTS') < script.indexOf('SCARD'), 'stale prune 必須早於容量檢查');
      } else if (command[0] === 'EVAL' && command[1].includes("'DEL'")) {
        const indexKey = command[3];
        const memberKey = command[4];
        members.delete(memberKey);
        indexes.get(indexKey)?.delete(memberKey);
      } else if (command[0] === 'EVAL' && command[1].includes('EXISTS')) {
        const indexKey = command[3];
        for (const key of command.slice(4)) {
          if (!members.has(key)) indexes.get(indexKey)?.delete(key);
        }
      } else if (command[0] === 'EVAL' && command[1].includes("'INCR'")) {
        const key = command[3];
        const next = (rateCounts.get(key) ?? 0) + 1;
        rateCounts.set(key, next);
        result = next;
      } else if (command[0] === 'SMEMBERS') {
        result = [...(indexes.get(command[1]) ?? new Set())];
      } else if (command[0] === 'MGET') {
        result = command.slice(1).map((key) => {
          const value = members.get(key)?.value ?? null;
          if (rewriteAfterMget?.key === key) {
            members.set(key, { value: rewriteAfterMget.value, ttl: 86_400 });
            rewriteAfterMget = null;
            return null;
          }
          return value;
        });
      }

      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const groupIndex = 'sleep-airline:presence:v2:group:0001';
    const staleMember = 'sleep-airline:presence:v2:member:0001:stale';
    const index = new Set<string>([staleMember]);
    for (let i = 0; i < 99; i += 1) {
      const key = `sleep-airline:presence:v2:member:0001:live-${i}`;
      index.add(key);
      members.set(key, { value: JSON.stringify({ ...validPassenger, passengerId: `live-${i}` }), ttl: 86_400 });
    }
    indexes.set(groupIndex, index);

    assert.equal(isPresenceConfigured(), true);
    assert.equal(
      (await checkInPassenger(validPassenger)).status,
      'saved',
      '滿載前應先移除不存在的 stale member'
    );
    const upsert = commands.find((command) => command[0] === 'EVAL' && String(command[1]).includes('SADD'));
    assert.ok(upsert);
    const memberKey = String(upsert[4]);
    assert.equal(members.get(memberKey)?.ttl, 86_400, 'member key 必須 EX 24h');
    assert.equal(indexTtls.get(groupIndex), 172_800, 'group index 必須 EX 48h');
    assert.equal(indexes.get(groupIndex)?.has(staleMember), false, 'upsert 應清理 stale index entry');
    assert.equal(
      (await checkInPassenger({ ...validPassenger, passengerId: 'over-capacity' })).status,
      'capacity'
    );

    const waiting = await getWaitingPassengers('0001');
    assert.ok(waiting.some((entry) => entry.passengerId === validPassenger.passengerId));
    assert.equal(
      (await checkOutPassenger('0001', validPassenger.passengerId)).status,
      'removed'
    );
    assert.equal(members.has(memberKey), false);
    assert.equal(indexes.get(groupIndex)?.has(memberKey), false);
    const checkout = commands.find((command) => command[0] === 'EVAL' && String(command[1]).includes("'DEL'"));
    assert.match(String(checkout?.[1]), /DEL[\s\S]*SREM/, 'checkout 必須原子 DEL + SREM');

    const racePassenger = { ...validPassenger, passengerId: 'race-passenger' };
    const raceKey = 'sleep-airline:presence:v2:member:0001:race-key';
    const replacement = JSON.stringify({ ...racePassenger, passengerName: 'New value' });
    indexes.set(groupIndex, new Set([raceKey]));
    members.delete(raceKey);
    rewriteAfterMget = { key: raceKey, value: replacement };
    await getWaitingPassengers('0001');
    assert.equal(members.get(raceKey)?.value, replacement, 'cleanup 不可刪除 MGET 後重新寫入的新值');
    assert.equal(indexes.get(groupIndex)?.has(raceKey), true, '新 member 仍存在時不可移除 index');

    for (let i = 0; i < 61; i += 1) {
      const allowed = await allowPresenceWrite('198.51.100.7');
      assert.equal(allowed, i < 60);
    }
  });
}

async function checkKvFallbackAndFailOpen() {
  await withPresenceEnv(async () => {
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    globalThis.fetch = (async () => {
      throw new Error('redis unavailable');
    }) as typeof fetch;
    console.warn = () => {};

    assert.equal((await checkInPassenger(validPassenger)).status, 'unavailable');
    assert.deepEqual(await getWaitingPassengers('0001'), []);
    assert.equal(
      (await checkOutPassenger('0001', validPassenger.passengerId)).status,
      'unavailable'
    );
    assert.equal(await allowPresenceWrite('198.51.100.8'), true);
  });
}

checkSessionTokens()
  .then(checkRedisMemberStore)
  .then(checkKvFallbackAndFailOpen)
  .then(() => console.log('✓ HMAC session、Redis TTL／索引清理／限流與 fail-open 正確'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
