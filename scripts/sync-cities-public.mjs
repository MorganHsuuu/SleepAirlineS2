import { copyFileSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const src = 'src/data/cities_data.json';
const dest = 'public/cities_data.json';
const isoDest = 'public/country-iso.json';

if (!existsSync(src)) {
  console.warn('sync-cities-public: missing', src);
  process.exit(0);
}

if (!existsSync(dest) || statSync(src).mtimeMs > statSync(dest).mtimeMs) {
  copyFileSync(src, dest);
  console.log('sync-cities-public: copied →', dest);
}

// 產生精簡的「國名（中/英）→ ISO2」對照，供前端顯示任何國家的國旗與當地文化
if (!existsSync(isoDest) || statSync(src).mtimeMs > statSync(isoDest).mtimeMs) {
  try {
    const rows = JSON.parse(readFileSync(src, 'utf8'));
    const map = {};
    for (const r of rows) {
      const iso = (r.country_iso_code || '').toUpperCase();
      if (!iso || iso.length !== 2) continue;
      for (const name of [r.country, r.country_zh]) {
        if (!name) continue;
        const key = String(name).trim().toLowerCase();
        if (key && !map[key]) map[key] = iso;
      }
    }
    writeFileSync(isoDest, JSON.stringify(map));
    console.log('sync-cities-public: wrote →', isoDest, `(${Object.keys(map).length} names)`);
  } catch (err) {
    console.warn('sync-cities-public: country-iso build failed:', err.message);
  }
}

// 同步飛行舷窗影片 scripts/*.mp4 → public/media/
const mediaDir = 'public/media';
const mediaMap = [
  ['scripts/takeoff1.mp4', 'takeoff.mp4'],
  ['scripts/takeoff2.mp4', 'cruise.mp4'],
  ['scripts/landing.mp4', 'landing.mp4'],
];
if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });
for (const [srcMp4, name] of mediaMap) {
  const destMp4 = join(mediaDir, name);
  if (!existsSync(srcMp4)) continue;
  if (!existsSync(destMp4) || statSync(srcMp4).mtimeMs > statSync(destMp4).mtimeMs) {
    copyFileSync(srcMp4, destMp4);
    console.log('sync-cities-public: copied →', destMp4);
  }
}
