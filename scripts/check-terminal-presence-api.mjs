import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const server = readFileSync(join(import.meta.dirname, '..', 'server.ts'), 'utf8');
const loginRoute = server.slice(
  server.indexOf("app.post('/api/passenger'"),
  server.indexOf("app.post('/api/passenger/avatar'")
);

assert.match(server, /app\.post\('\/api\/presence\/check-in'/);
assert.match(server, /app\.post\('\/api\/presence\/check-out'/);
assert.match(server, /presenceReady:\s*isPresenceConfigured\(\)/);
assert.match(server, /presenceSessionToken:\s*issuePresenceSessionToken\(/);
assert.match(server, /verifyPresenceSessionToken\(/);
assert.match(server, /allowPresenceWrite\(/);
assert.match(server, /function presenceRateKey[\s\S]*req\.ip/);
assert.doesNotMatch(server, /x-forwarded-for/i);
assert.match(server, /res\.status\(401\).*invalid_presence_session/s);
assert.match(server, /res\.status\(429\).*presence_rate_limited/s);
assert.match(server, /checkInResult\.status === 'capacity'[\s\S]*res\.status\((?:409|429)\)/);
assert.match(server, /checkInResult\.status === 'unavailable'[\s\S]*res\.status\(503\)/);
assert.match(server, /checkOutResult\.status === 'unavailable'[\s\S]*res\.status\(503\)/);
assert.match(server, /getWaitingPassengers\(groupId\)/);
assert.match(server, /res\.json\(\{\s*flights:\s*enriched,\s*waitingPassengers/s);
assert.match(server, /await checkOutPassenger\(passenger\.groupId,\s*passengerId\)/);
assert.doesNotMatch(loginRoute, /createFlight\(/);

console.log('✓ 候機 API、看板合併與「起飛才建立 Flight Log」契約正確');
