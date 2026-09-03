import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const app = readFileSync(join(root, 'public/app.js'), 'utf8');
const i18n = readFileSync(join(root, 'public/i18n.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const workshopLocal = readFileSync(join(root, 'public/workshop-local.js'), 'utf8');

assert.match(app, /async function checkInPresence/);
assert.match(app, /checkInPresence\(\{\s*retryOnce = false\s*\} = \{\}\)/);
assert.match(app, /await waitMs\(750\)/);
assert.match(app, /checkInPresence\(\{\s*retryOnce: true\s*\}\)/);
assert.match(app, /async function checkOutPresence/);
assert.match(app, /waitingPassengers/);
assert.match(app, /function getBoardRows/);
assert.match(app, /isWaiting/);
assert.match(app, /await checkInPresence\(\)/);
assert.match(app, /void checkInPresence\(\{\s*retryOnce: true\s*\}\)/);
assert.match(app, /void checkOutPresence\(/);
assert.match(app, /presenceMutationQueue/);
assert.match(app, /let presenceSessionToken = null/);
assert.match(app, /presenceToken:\s*currentPresenceToken/);
assert.match(app, /presenceSessionToken = data\.presenceSessionToken \|\| null/);
assert.match(app, /presenceSessionToken = null/);
assert.doesNotMatch(app, /localStorage\.(?:setItem|getItem)\([^)]*presenceSessionToken/);
assert.match(app, /const max = 128/);
assert.match(app, /toDataURL\('image\/jpeg', 0\.65\)/);
assert.match(app, /const requestedPassengerId = passenger\.passengerId/);
assert.match(app, /passenger\?\.passengerId !== requestedPassengerId/);
assert.match(app, /if \(!f \|\| f\.isWaiting\) return/);
assert.match(i18n, /'board\.tagWaiting': '候機中'/);
assert.match(i18n, /'board\.tagWaiting': 'Waiting'/);
assert.match(css, /\.tag-wait/);
assert.match(css, /\.brow\.is-waiting/);
const autoRefresh = app.slice(app.indexOf('function startAutoRefresh'), app.indexOf('function stopAutoRefresh'));
assert.doesNotMatch(autoRefresh, /checkInPresence/);
assert.doesNotMatch(app, /setInterval\([^)]*checkInPresence/);
const checkInFlow = app.slice(app.indexOf('async function checkInPresence'), app.indexOf('async function checkOutPresence'));
assert.equal((checkInFlow.match(/request\(\)/g) ?? []).length, 2, '初次 check-in 最多只能嘗試兩次');
assert.match(app, /window\.WorkshopLocal\?\.isActive\?\.\(\)\s*&&\s*passenger\.status !== 'in_flight'/);
const loginFlow = app.slice(app.indexOf('async function doLogin'), app.indexOf('function setLoginLoading'));
assert.ok(
  loginFlow.indexOf('presenceSessionToken =')
  < loginFlow.indexOf('checkInPresence({ retryOnce: true })')
);
assert.match(
  loginFlow,
  /checkInPresence\(\{\s*retryOnce: true\s*\}\)\.then\(\(result\)[\s\S]*fetchBoard\(\)/
);
const takeoffFlow = app.slice(app.indexOf('async function doTakeoff'), app.indexOf('async function doLand'));
assert.ok(takeoffFlow.indexOf("api('POST', '/api/flight/takeoff'") < takeoffFlow.indexOf('checkOutPresence('));
const logoutFlow = app.slice(app.indexOf('function doLogout'), app.indexOf('// ── 自動更新'));
assert.ok(logoutFlow.indexOf('checkOutPresence(') < logoutFlow.indexOf('presenceSessionToken = null'));
assert.match(workshopLocal, /presence:\s*data\.presence/);
assert.match(workshopLocal, /path === '\/api\/presence\/check-in'/);
assert.match(workshopLocal, /path === '\/api\/presence\/check-out'/);
assert.match(workshopLocal, /waitingPassengers/);
assert.match(workshopLocal, /24 \* 60 \* 60 \* 1000/);
assert.match(workshopLocal, /MAX_PRESENCE_AVATAR_LENGTH = 50_000/);
assert.match(workshopLocal, /data:image\\\/\(\?:jpeg\|jpg\|png\|webp\);base64/);
assert.match(workshopLocal, /delete store\.presence\[body\.passengerId\]/);
assert.doesNotMatch(workshopLocal, /setInterval/);
assert.match(workshopLocal, /window\.location\.origin !== 'null'/);

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const window = { location: { protocol: 'file:', origin: 'null', hostname: '' } };
window.window = window;
vm.runInNewContext(workshopLocal, {
  window,
  localStorage,
  URL,
  Date,
  Math,
  console,
  setTimeout,
  clearTimeout,
});

await window.WorkshopLocal.probe();
const localApi = window.WorkshopLocal.handle;
await localApi('POST', '/api/passenger', {
  passengerId: 'local-a',
  name: 'Local A',
  groupId: '0001',
  researchConsent: true,
});
await localApi('POST', '/api/presence/check-in', {
  passengerId: 'local-a',
  passengerName: 'Local A',
  groupId: '0001',
  idPhotoUrl: 'data:text/html;base64,unsafe',
  checkedInAt: '2099-01-01T00:00:00.000Z',
});
const localWaiting = (await localApi('GET', '/api/board?groupId=0001')).waitingPassengers;
assert.equal(localWaiting.length, 1);
assert.equal(localWaiting[0].idPhotoUrl, null);
assert.notEqual(localWaiting[0].checkedInAt, '2099-01-01T00:00:00.000Z');
assert.equal((await localApi('GET', '/api/board?groupId=0002')).waitingPassengers.length, 0);

const localStoreKey = 'sleepAirline_workshopLocal_v1';
const withStalePresence = JSON.parse(storage.get(localStoreKey));
withStalePresence.presence.stale = {
  passengerId: 'stale',
  passengerName: 'Stale',
  groupId: '0001',
  checkedInAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
};
storage.set(localStoreKey, JSON.stringify(withStalePresence));
assert.equal(
  (await localApi('GET', '/api/board?groupId=0001')).waitingPassengers.some(
    (entry) => entry.passengerId === 'stale'
  ),
  false
);

await localApi('POST', '/api/presence/check-in', {
  passengerId: 'local-b',
  passengerName: 'Local B',
  groupId: '0001',
});
await localApi('POST', '/api/presence/check-out', {
  passengerId: 'local-b',
  groupId: '0001',
});
assert.equal(
  (await localApi('GET', '/api/board?groupId=0001')).waitingPassengers.some(
    (entry) => entry.passengerId === 'local-b'
  ),
  false
);

await localApi('POST', '/api/flight/takeoff', {
  passengerId: 'local-a',
  routeDirection: 'eastbound',
  researchConsent: true,
});
const afterTakeoff = await localApi('GET', '/api/board?groupId=0001');
assert.equal(afterTakeoff.waitingPassengers.length, 0);
assert.equal(afterTakeoff.flights.filter((flight) => flight.status === 'in_flight').length, 1);

console.log('✓ 登入頭像候機列、起飛／登出清除與不可開啟詳情的 UI 契約正確');
