// ── WORKSHOP 資料契約 ───────────────────────────────────────────────────────
// 改 UI 前請讀 docs/WORKSHOP_CONTRACT.md
// 必保留：doLogin / doTakeoff / doLand / fetchBoard / refreshProgress 的
//         API 路徑與 body 欄位名（passengerId, name, groupId, routeDirection…）
// 必保留：input-pid, input-name, input-group, tk-direction, btn-takeoff, btn-land 等 id
// 可任意改：視覺、文案、動畫；改完執行 npm run check:contract
// ────────────────────────────────────────────────────────────────────────────

'use strict';

// iOS Safari 仍可能觸發整頁 pinch zoom；地球本身有 pointer 手勢縮放，不依賴瀏覽器縮放。
['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
});

// ── 常數與顯示對照 ────────────────────────────────────────────────────────────

const DIRECTION_LABEL = {
  auto: '自動', eastbound: '向東', westbound: '向西', northbound: '向北',
  southbound: '向南', northeast: '東北', northwest: '西北',
  southeast: '東南', southwest: '西南', circular: '環形', unknown: '未知',
};
const DIRECTION_BEARING = {
  northbound: 0, northeast: 45, eastbound: 90, southeast: 135,
  southbound: 180, southwest: 225, westbound: 270, northwest: 315,
};
/** auto / circular / unknown → 與後端 estimateFlightPosition 一致，預設向東 */
function routeBearing(dir) {
  return DIRECTION_BEARING[dir] ?? 90;
}
const STATUS_LABEL = {
  not_started: '待起飛', in_flight: '飛行中', landed: '已降落',
  boarding: '準備登機', cancelled: '已取消',
};
const KM_PER_MINUTE = 12;                    // 與後端 distance.ts / workshop-local 一致
const DEFAULT_COORD = [121.5654, 25.033];    // Taipei
/** 飛行舷窗影片（public/media/） */
const FLIGHT_MEDIA = {
  takeoff: 'media/takeoff.mp4',
  descent: 'media/takeoff2.mp4',
  cruise: 'media/cruise.mp4',
  landing: 'media/landing.mp4',
};
/** 起飛／降落飛行音效 */
const FLIGHT_SFX = {
  takeoff: 'media/takeoff.mp3',
};
/** 降落甦醒音景（wakeup1–4 隨機；可改 window.SLEEP_AIRLINE_LANDING_MUSIC） */
const WAKEUP_TRACKS = [
  'media/wakeup1.mp3',
  'media/wakeup2.mp3',
  'media/wakeup3.mp3',
  'media/wakeup4.mp3',
];
const LANDING_MUSIC = {
  volume: 0.22,
  title: '甦醒音景',
};
let landingMusicPick = null;
function landingMusicConfig() {
  const o = window.SLEEP_AIRLINE_LANDING_MUSIC;
  if (o === false || o?.url === false || o?.url === '') return null;
  const url = o?.url || landingMusicPick || WAKEUP_TRACKS[0];
  return { ...LANDING_MUSIC, url, ...o };
}
let landingMusicActive = false;
function syncLandingMusicLabel(_visible) {
  /* 甦醒音景僅背景播放，不顯示 UI 標籤 */
}
async function startLandingMusic() {
  const o = window.SLEEP_AIRLINE_LANDING_MUSIC;
  if (!landingMusicPick && !o?.url) {
    landingMusicPick = WAKEUP_TRACKS[Math.floor(Math.random() * WAKEUP_TRACKS.length)];
  }
  const cfg = landingMusicConfig();
  if (!cfg?.url || !window.BroadcastAudio?.playLandingMusic) return false;
  const ok = await BroadcastAudio.playLandingMusic(cfg.url, { volume: cfg.volume });
  landingMusicActive = ok;
  syncLandingMusicLabel(ok);
  return ok;
}
function stopLandingMusic() {
  BroadcastAudio?.stopLandingMusic?.();
  landingMusicActive = false;
  landingMusicPick = null;
  syncLandingMusicLabel(false);
}
/** 飛行中氛圍文案（輪替，不強調數字） */
const FLIGHT_WHISPERS = [
  '雲層在舷窗外緩緩流過…',
  '前方仍是一片溫柔的天光…',
  '夜航仍在向前…',
  '讓睡意帶你穿過這片寧靜…',
  '航程像一條發光的細線，延伸向遠方…',
];
const AVATAR_COLORS = ['#d9a63a', '#5b8ed6', '#8f7fd0', '#5eae9d', '#d97f8e', '#7aa85e'];
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 抵達：國旗 + 當地文化（可自由增修）──────────────────────────────────────
// key = 國家 ISO2；culture 為抵達時顯示的當地文化 / 社交小語（繁體中文）
const CULTURE_BY_ISO = {
  JP: { name: '日本', culture: '日本人以鞠躬問候，泡湯前務必先洗淨身體；電車上請保持安靜，抵達後不妨對鄰座乘客輕輕點頭致意。' },
  KR: { name: '南韓', culture: '韓國重視長幼禮節，遞物、乾杯都用雙手；深夜的炸雞配啤酒（치맥）是與朋友聯絡感情的儀式。' },
  CN: { name: '中國', culture: '中式圓桌講究「轉盤禮讓長輩先動筷」，喝茶時以手指輕敲桌面即是道謝。' },
  TW: { name: '台灣', culture: '台灣的夜市與便利商店是深夜社交的核心，一句「呷飽沒？」就是最溫暖的問候。' },
  HK: { name: '香港', culture: '香港茶餐廳「搭檯」是常態，與陌生人同桌時點杯凍鴛鴦，感受這座城市的快節奏。' },
  TH: { name: '泰國', culture: '泰式合十禮（wai）雙手合十微微低頭；頭部被視為神聖，切勿隨意觸碰他人的頭。' },
  VN: { name: '越南', culture: '越南的街邊小塑膠椅是社交舞台，一杯煉乳滴漏咖啡能坐上一整個午後。' },
  SG: { name: '新加坡', culture: '新加坡的熟食中心（hawker centre）用面紙包「佔位」是默契；多元族群讓一餐就能吃遍三種文化。' },
  MY: { name: '馬來西亞', culture: '馬來西亞的 mamak 檔徹夜營業，配上拉茶（teh tarik）是朋友宵夜暢聊的首選。' },
  ID: { name: '印尼', culture: '印尼人以右手遞物與用餐，微笑是最通用的語言；峇里島的日出更是不可錯過的儀式。' },
  PH: { name: '菲律賓', culture: '菲律賓人熱情好客，晚輩會將長輩的手貼額（mano）以示敬意，卡拉OK更是全民社交運動。' },
  IN: { name: '印度', culture: '印度以「Namaste」雙手合十問候；用餐與遞物慣用右手，街頭奶茶（chai）是拉近距離的媒介。' },
  AE: { name: '阿聯', culture: '阿聯待客會奉上阿拉伯咖啡（gahwa）與椰棗；接受招待是一種尊重的表現。' },
  TR: { name: '土耳其', culture: '土耳其的紅茶（çay）盛在鬱金香杯裡，一天可以喝上好幾杯，是待客與談心的象徵。' },
  RU: { name: '俄羅斯', culture: '俄羅斯人初見略顯嚴肅，熟稔後極為好客；作客記得帶上單數鮮花，雙數是給逝者的。' },
  GB: { name: '英國', culture: '英國人排隊（queue）神聖不可插隊；到 pub 點杯啤酒與人閒聊天氣，是最道地的社交。' },
  FR: { name: '法國', culture: '法國進店會先說「Bonjour」；用餐是慢享時光，貼臉頰的 bise 是朋友間的問候。' },
  DE: { name: '德國', culture: '德國人守時即禮貌，乾杯時要眼神對視；週末的啤酒花園是全家與朋友的聚會地。' },
  IT: { name: '義大利', culture: '義大利的咖啡站著喝，午後不點卡布奇諾；餐桌是感情所在，慢食才是尊重。' },
  ES: { name: '西班牙', culture: '西班牙人晚餐常在九點後，tapas 配聊天可以到深夜；午後的小睡（siesta）也是生活節奏。' },
  PT: { name: '葡萄牙', culture: '葡萄牙的 Fado 哀歌訴說鄉愁，配一杯波特酒；街角咖啡與蛋塔是日常的溫柔。' },
  NL: { name: '荷蘭', culture: '荷蘭人直率坦誠，單車是主要交通；運河邊的 borrel（下班小酌）是重要的社交時刻。' },
  CH: { name: '瑞士', culture: '瑞士人重視守時與隱私，火鍋（fondue）圍爐分食是冬日聚會的溫暖象徵。' },
  SE: { name: '瑞典', culture: '瑞典有「fika」文化：暫停手邊事，配咖啡與肉桂捲和朋友談心。' },
  NO: { name: '挪威', culture: '挪威人熱愛戶外（friluftsliv），週末登山滑雪；夏夜的午夜太陽更是奇景。' },
  FI: { name: '芬蘭', culture: '芬蘭桑拿是社交聖地，坦誠相見暢談人生；芬蘭人珍惜安靜，沉默也是舒適的相處。' },
  DK: { name: '丹麥', culture: '丹麥的 hygge 是點上蠟燭、與親友共度的溫馨時光；單車與極簡設計融入日常。' },
  GR: { name: '希臘', culture: '希臘人熱情奔放，餐桌上分享菜餚（meze）配 ouzo；打破盤子曾是慶祝的傳統。' },
  PL: { name: '波蘭', culture: '波蘭人好客，作客常備伏特加乾杯（Na zdrowie！）；聖誕夜的 12 道菜是重要家庭儀式。' },
  CZ: { name: '捷克', culture: '捷克是啤酒人均消費世界第一，酒館（hospoda）是朋友暢談的據點，乾杯要碰杯底。' },
  AT: { name: '奧地利', culture: '奧地利的咖啡館文化悠久，點杯 Melange 配一份報紙，可以坐上一整個下午。' },
  IE: { name: '愛爾蘭', culture: '愛爾蘭的 pub 是社區心臟，現場音樂與健力士黑啤配上「craic」（歡樂閒聊）最對味。' },
  IS: { name: '冰島', culture: '冰島人泡地熱溫泉閒話家常；追極光、泡溫泉是與朋友相聚的日常浪漫。' },
  US: { name: '美國', culture: '美國人習慣以微笑與 small talk 破冰，小費文化普遍；週末的 BBQ 是鄰里社交的經典。' },
  CA: { name: '加拿大', culture: '加拿大人以禮貌著稱，「sorry」不離口；冬天的冰球與楓糖漿是國民驕傲。' },
  MX: { name: '墨西哥', culture: '墨西哥人熱情擁抱問候，街頭 taco 攤是深夜社交場；亡靈節以繽紛色彩紀念摯愛。' },
  BR: { name: '巴西', culture: '巴西人以貼臉頰與擁抱問候，海灘、森巴與烤肉聚會（churrasco）是生活的節奏。' },
  AR: { name: '阿根廷', culture: '阿根廷人傳飲瑪黛茶（mate）共用一支吸管，是深厚友誼的象徵；晚餐與探戈都很晚才開始。' },
  CL: { name: '智利', culture: '智利人親切好客，見面貼臉頰問候；週末常與家人朋友聚餐配上一杯本地紅酒。' },
  PE: { name: '秘魯', culture: '秘魯是美食之國，檸檬醃生魚（ceviche）人人愛；分享食物是拉近彼此的方式。' },
  CO: { name: '哥倫比亞', culture: '哥倫比亞人熱情洋溢，一杯 tinto（黑咖啡）配閒聊；週末廣場常有音樂與舞蹈。' },
  AU: { name: '澳洲', culture: '澳洲人隨和friendly，愛用暱稱與「no worries」；週末海灘與後院 BBQ 是社交日常。' },
  NZ: { name: '紐西蘭', culture: '紐西蘭毛利文化以碰鼻禮（hongi）交換氣息；戶外健行與友善的 Kiwi 精神無所不在。' },
  ZA: { name: '南非', culture: '南非的 braai（炭烤聚會）跨越族群，是週末最重要的社交；「彩虹之國」多元共融。' },
  EG: { name: '埃及', culture: '埃及人熱情好客，作客會被熱情勸食；一杯薄荷紅茶配水煙是街坊談天的日常。' },
  MA: { name: '摩洛哥', culture: '摩洛哥的薄荷茶高高沖倒起泡，是待客之道；市集（souk）裡討價還價也是一種交流。' },
  KE: { name: '肯亞', culture: '肯亞以「Jambo！」問候，Ubuntu 精神強調彼此連結；分享一餐 ugali 就是朋友。' },
  RE: { name: '留尼旺', culture: '留尼旺是法語文化島嶼，見面先說「Bonjour」；克里奧（Creole）料理與火山景觀是當地特色。' },
};
const DEFAULT_CULTURE = '你降落在一座陌生的城市。深呼吸，帶著好奇心向當地人微笑問好——旅行最美的風景，往往是人與人的相遇。';

const ISO_TO_ZH = {};
for (const [iso, info] of Object.entries(CULTURE_BY_ISO)) {
  ISO_TO_ZH[iso] = info.name;
}

// 國家名稱（英/中）→ ISO2，供無 ISO 的後端資料回推國旗與文化
const NAME2ISO = {
  japan: 'JP', 日本: 'JP', 'south korea': 'KR', korea: 'KR', 南韓: 'KR', 韓國: 'KR',
  china: 'CN', 中國: 'CN', 'hong kong': 'HK', 香港: 'HK', taiwan: 'TW', 台灣: 'TW', 臺灣: 'TW',
  thailand: 'TH', 泰國: 'TH', vietnam: 'VN', 越南: 'VN', singapore: 'SG', 新加坡: 'SG',
  malaysia: 'MY', 馬來西亞: 'MY', indonesia: 'ID', 印尼: 'ID', philippines: 'PH', 菲律賓: 'PH',
  india: 'IN', 印度: 'IN', 'united arab emirates': 'AE', uae: 'AE', 阿聯: 'AE', 阿拉伯聯合大公國: 'AE',
  turkey: 'TR', türkiye: 'TR', 土耳其: 'TR', russia: 'RU', 俄羅斯: 'RU',
  'united kingdom': 'GB', uk: 'GB', england: 'GB', 英國: 'GB', france: 'FR', 法國: 'FR',
  germany: 'DE', 德國: 'DE', italy: 'IT', 義大利: 'IT', spain: 'ES', 西班牙: 'ES',
  portugal: 'PT', 葡萄牙: 'PT', netherlands: 'NL', 荷蘭: 'NL', switzerland: 'CH', 瑞士: 'CH',
  sweden: 'SE', 瑞典: 'SE', norway: 'NO', 挪威: 'NO', finland: 'FI', 芬蘭: 'FI',
  denmark: 'DK', 丹麥: 'DK', greece: 'GR', 希臘: 'GR', poland: 'PL', 波蘭: 'PL',
  czechia: 'CZ', 'czech republic': 'CZ', 捷克: 'CZ', austria: 'AT', 奧地利: 'AT',
  ireland: 'IE', 愛爾蘭: 'IE', iceland: 'IS', 冰島: 'IS',
  'united states': 'US', usa: 'US', 'united states of america': 'US', 美國: 'US',
  canada: 'CA', 加拿大: 'CA', mexico: 'MX', 墨西哥: 'MX', brazil: 'BR', 巴西: 'BR',
  argentina: 'AR', 阿根廷: 'AR', chile: 'CL', 智利: 'CL', peru: 'PE', 秘魯: 'PE',
  colombia: 'CO', 哥倫比亞: 'CO', australia: 'AU', 澳洲: 'AU', 澳大利亞: 'AU',
  'new zealand': 'NZ', 紐西蘭: 'NZ', 'south africa': 'ZA', 南非: 'ZA',
  egypt: 'EG', 埃及: 'EG', morocco: 'MA', 摩洛哥: 'MA', kenya: 'KE', 肯亞: 'KE',
};

/** 載入由 cities 產生的完整國名→ISO 對照（涵蓋所有國家的中/英名），補進 NAME2ISO */
async function loadCountryIso() {
  for (const url of ['./country-iso.json', '/country-iso.json']) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const map = await res.json();
      for (const [k, v] of Object.entries(map)) {
        if (!NAME2ISO[k]) NAME2ISO[k] = v;
        if (/[\u4e00-\u9fff]/.test(k)) ISO_TO_ZH[v] = ISO_TO_ZH[v] || k;
      }
      for (const [iso, info] of Object.entries(CULTURE_BY_ISO)) {
        ISO_TO_ZH[iso] = ISO_TO_ZH[iso] || info.name;
      }
      return;
    } catch { /* try next */ }
  }
  for (const [iso, info] of Object.entries(CULTURE_BY_ISO)) {
    ISO_TO_ZH[iso] = ISO_TO_ZH[iso] || info.name;
  }
}

/** ISO2 → 國旗 emoji（區域指示符號）*/
function isoToFlag(iso) {
  if (!iso || iso.length !== 2) return '';
  const base = 0x1F1E6;
  const c = iso.toUpperCase();
  const a = c.charCodeAt(0) - 65, b = c.charCodeAt(1) - 65;
  if (a < 0 || a > 25 || b < 0 || b > 25) return '';
  return String.fromCodePoint(base + a, base + b);
}

/** 由地點字串解析城市、ISO、中文國名、國旗 */
function locationMeta(location, opts = {}) {
  const isoHint = (opts.iso || '').toUpperCase();
  let countryRaw = (opts.country || '').trim();
  const parts = String(location || '').split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts[0] || '—';
  if (!countryRaw && parts.length > 1) countryRaw = parts[parts.length - 1];
  let iso = isoHint;
  if (!iso && countryRaw) {
    iso = NAME2ISO[countryRaw.toLowerCase()] || NAME2ISO[countryRaw] || '';
  }
  const info = iso ? CULTURE_BY_ISO[iso] : null;
  const countryZh = (iso && ISO_TO_ZH[iso]) || info?.name || countryRaw || '未知';
  return {
    city,
    country: countryRaw || countryZh,
    countryZh,
    iso,
    flag: isoToFlag(iso) || '🌍',
    culture: info?.culture || DEFAULT_CULTURE,
  };
}

function departureMeta(f) {
  return locationMeta(f?.departureLocation, {
    iso: f?.departureIso,
    country: f?.departureCountry,
  });
}

/** 由航班取出抵達地的國旗 / 國家名 / 當地文化 */
function arrivalMeta(f) {
  const m = locationMeta(f?.arrivalLocation, {
    iso: f?.arrivalIso,
    country: f?.arrivalCountry,
  });
  return {
    ...m,
    country: m.countryZh,
  };
}

/** 航線 arc：起點與終點皆顯示國旗 + 城市 + 中文國名；飛行中終點留空 */
function fillRouteArc(ids, depMeta, arrMeta, { inFlight = false } = {}) {
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text || '—'; };
  set(ids.depFlag, depMeta?.flag || '🌍');
  set(ids.depCity, depMeta?.city || '—');
  set(ids.depCountry, depMeta?.countryZh || '—');
  if (inFlight || !arrMeta) {
    set(ids.arrFlag, '✈');
    set(ids.arrCity, '飛行中');
    set(ids.arrCountry, '目的地待揭曉');
  } else {
    set(ids.arrFlag, arrMeta.flag || '🌍');
    set(ids.arrCity, arrMeta.city || '—');
    set(ids.arrCountry, arrMeta.countryZh || '—');
  }
}

function formatPlaceLine(meta) {
  if (!meta || meta.city === '—') return '—';
  return `${meta.flag} ${meta.city} · ${meta.countryZh}`;
}

/** 看板列表：起點 → 終點（飛行中僅起點） */
function formatBoardRouteLine(f) {
  const depM = departureMeta(f);
  const depLine = formatPlaceLine(depM);
  if (f.status === 'in_flight') {
    const elapsed = fmtDuration(minutesSince(f.takeoffTime));
    return `${depLine} → … · 已飛 ${elapsed}`;
  }
  if (f.status === 'landed' && f.arrivalLocation) {
    const arrM = arrivalMeta(f);
    const dur = fmtDuration(f.flightDurationMinutes);
    return `${depLine} → ${formatPlaceLine(arrM)} · 飛了 ${dur}`;
  }
  if (f.status === 'not_started') return `${depLine} · 待起飛`;
  return STATUS_LABEL[f.status] || f.status;
}

/** 飛行中不帶抵達地（避免 Notion 舊資料誤顯示終點） */
function sanitizeBoardFlight(f) {
  if (!f || f.status !== 'in_flight') return f;
  return {
    ...f,
    arrivalLocation: null,
    arrivalLatitude: null,
    arrivalLongitude: null,
    landingTime: null,
    flightDurationMinutes: null,
    estimatedFlightDistanceKm: null,
    captainBroadcast: null,
  };
}

/** 離線 / 無 AI 圖時：以城市名產生一張「機窗晨景」SVG（依日夜主題變化）*/
function buildWindowScene(cityName) {
  let h = 0;
  for (const ch of String(cityName || 'sky')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const dusk = document.body.dataset.theme === 'dusk';
  const sky = dusk
    ? ['#1b2547', '#3a3160', '#7a4a5c', '#c9794e']
    : ['#a9d2f2', '#cfe6f7', '#ffe6c4', '#ffd39a'];
  const sun = dusk ? '#ffd38a' : '#fff6d8';
  const sunY = 118 + (h % 40);
  const sunX = 60 + (h % 200);
  const hillHue = dusk ? 232 : 205;
  const bldg = dusk ? 'rgba(20,26,50,0.92)' : 'rgba(70,95,130,0.55)';
  const bldgs = [];
  let x = 10;
  let seed = h;
  while (x < 320) {
    seed = (seed * 9301 + 49297) % 233280;
    const w = 16 + (seed % 26);
    const bh = 26 + (seed % 70);
    bldgs.push(`<rect x="${x}" y="${240 - bh}" width="${w}" height="${bh}" rx="2" fill="${bldg}"/>`);
    x += w + 5 + (seed % 8);
  }
  return `
  <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wsSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${sky[0]}"/>
        <stop offset="45%" stop-color="${sky[1]}"/>
        <stop offset="78%" stop-color="${sky[2]}"/>
        <stop offset="100%" stop-color="${sky[3]}"/>
      </linearGradient>
      <radialGradient id="wsSun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${sun}" stop-opacity="1"/>
        <stop offset="60%" stop-color="${sun}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${sun}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="240" fill="url(#wsSky)"/>
    <circle cx="${sunX}" cy="${sunY}" r="60" fill="url(#wsSun)"/>
    <circle cx="${sunX}" cy="${sunY}" r="20" fill="${sun}" opacity="0.95"/>
    <path d="M0 176 Q 80 150 160 172 T 320 166 V240 H0 Z" fill="hsl(${hillHue} 35% ${dusk ? 22 : 60}% / 0.55)"/>
    <g opacity="0.95">${bldgs.join('')}</g>
    <g fill="#fff" opacity="${dusk ? 0.5 : 0.85}">
      <ellipse cx="70" cy="70" rx="26" ry="9"/>
      <ellipse cx="250" cy="52" rx="34" ry="11"/>
    </g>
  </svg>`;
}

// ── 狀態 ─────────────────────────────────────────────────────────────────────

let passenger = null;
let activeFlight = null;
let groupFlights = [];
let lastLandedFlight = null;
let landingScenery = null;
let refreshTimer = null;
let flightTicker = null;
let previewMode = false;
/** 羅盤確認航向後，主按鈕才切換為「起飛」 */
let takeoffArmed = false;
let landArmed = false;
/** 全螢幕過場進行中：凍結 dock 切換，等上層退場後再接續 */
let fxDockLock = null; // 'takeoff' | 'landing'
/** 地球儀航跡圖層：我的／隊友歷史航程 */
let routeTrails = { mine: true, friends: true };
const TRAILS_KEY = 'sleepAirline_trails_v1';

const $ = (id) => document.getElementById(id);

// ── 主題（白天活潑 / 夜間沉穩）────────────────────────────────────────────────

function autoTheme() {
  const h = new Date().getHours();
  return (h >= 5 && h < 17) ? 'day' : 'dusk';
}
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const btn = $('btn-theme');
  if (btn) btn.textContent = theme === 'day' ? '🌙' : '🌞';
  Globe.refreshPalette();
}
function toggleTheme() {
  applyTheme(document.body.dataset.theme === 'day' ? 'dusk' : 'day');
}

// ── 地理小工具 ────────────────────────────────────────────────────────────────

const toRad = (d) => d * Math.PI / 180;
const toDeg = (r) => r * 180 / Math.PI;

/** 從起點沿方位角走 distKm 的落點（球面） */
function destPoint([lon, lat], bearingDeg, distKm) {
  const δ = distKm / 6371, θ = toRad(bearingDeg);
  const φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRouteInDirection(bearing, direction) {
  const b = ((bearing % 360) + 360) % 360;
  switch (direction) {
    case 'northbound': return b >= 315 || b < 45;
    case 'northeast': return b >= 22.5 && b < 67.5;
    case 'eastbound': return b >= 45 && b < 135;
    case 'southeast': return b >= 112.5 && b < 157.5;
    case 'southbound': return b >= 135 && b < 225;
    case 'southwest': return b >= 202.5 && b < 247.5;
    case 'westbound': return b >= 225 && b < 315;
    case 'northwest': return b >= 292.5 && b < 337.5;
    default: return true;
  }
}

/** 城市庫（與後端降落選城同一份），用來預測飛行中目的地 */
let citiesCache = null;
let citiesLoadPromise = null;

function parseCitiesPayload(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e.latitude != null && e.longitude != null && e.city)
    .map((entry) => {
      const country =
        entry.country && entry.country.length > 2
          ? entry.country
          : entry.country_zh || entry.country;
      const displayName =
        entry.city_zh && entry.country_zh
          ? `${entry.city_zh}, ${entry.country_zh}`
          : `${entry.city}, ${entry.country}`;
      return {
        displayName,
        latitude: entry.latitude,
        longitude: entry.longitude,
        availableForLanding: true,
      };
    });
}

async function ensureCities() {
  if (citiesCache) return citiesCache;
  if (citiesLoadPromise) return citiesLoadPromise;
  citiesLoadPromise = (async () => {
    try {
      const res = await fetch('/cities_data.json');
      if (!res.ok) throw new Error('cities missing');
      citiesCache = parseCitiesPayload(await res.json());
    } catch {
      citiesCache = [];
    }
    return citiesCache;
  })();
  return citiesLoadPromise;
}

/** 與後端 findArrivalDestination 一致：選最靠近軌跡尖端的城市 */
function findArrivalNearTip(depLat, depLng, distanceKm, routeDirection, departureLocation) {
  if (!citiesCache?.length) return null;
  const tipBearing = DIRECTION_BEARING[routeDirection] ?? 90;
  const tip = destPoint([depLng, depLat], tipBearing, Math.max(distanceKm, 1));
  const available = citiesCache.filter((d) => d.displayName !== departureLocation);
  if (!available.length) return null;

  const scored = available.map((dest) => {
    const actualDistance = haversineKm(depLat, depLng, dest.latitude, dest.longitude);
    const brng = bearingFromTo([depLng, depLat], [dest.longitude, dest.latitude]);
    const tipDistanceKm = haversineKm(tip[1], tip[0], dest.latitude, dest.longitude);
    return {
      ...dest,
      distanceKm: actualDistance,
      tipDistanceKm,
      inDirection: isRouteInDirection(brng, routeDirection),
    };
  });
  const byTip = (a, b) => {
    const tipDiff = a.tipDistanceKm - b.tipDistanceKm;
    if (Math.abs(tipDiff) > 1) return tipDiff;
    return Math.abs(a.distanceKm - distanceKm) - Math.abs(b.distanceKm - distanceKm);
  };
  const directional = scored.filter((c) => c.inDirection);
  if (directional.length) {
    directional.sort(byTip);
    return directional[0];
  }
  scored.sort(byTip);
  return scored[0] || null;
}

function predictFlightArrival(f) {
  const dep = coordOf(f, 'departureLatitude', 'departureLongitude');
  if (!dep || !f) return null;
  const km = Math.max(minutesSince(f.takeoffTime) * KM_PER_MINUTE, 1);
  const dest = findArrivalNearTip(
    dep[1], dep[0], km,
    f.routeDirection,
    f.departureLocation,
  );
  if (!dest) return null;
  const totalKm = Math.max(dest.distanceKm, 1);
  const planeT = Math.min(0.98, km / totalKm);
  return {
    from: dep,
    to: [dest.longitude, dest.latitude],
    label: cityOnly(dest.displayName) || dest.displayName,
    planeT,
    km,
    totalKm,
  };
}

function interpolateRoute(from, to, t) {
  if (window.d3?.geoInterpolate) return d3.geoInterpolate(from, to)(Math.min(1, Math.max(0, t)));
  const brng = bearingFromTo(from, to);
  const dist = haversineKm(from[1], from[0], to[1], to[0]) * Math.min(1, Math.max(0, t));
  return destPoint(from, brng, dist);
}

function coordOf(obj, latKey, lngKey) {
  const lat = obj?.[latKey], lng = obj?.[lngKey];
  if (typeof lat === 'number' && typeof lng === 'number' && (lat || lng)) return [lng, lat];
  return null;
}

/** 起點 → 終點方位角（0=北，順時針） */
function bearingFromTo(from, to) {
  const [lng1, lat1] = from, [lng2, lat2] = to;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function bearingLabel(bearing) {
  const b = ((bearing % 360) + 360) % 360;
  const bands = [
    [22.5, '北'], [67.5, '東北'], [112.5, '東'], [157.5, '東南'],
    [202.5, '南'], [247.5, '西南'], [292.5, '西'], [337.5, '西北'], [360, '北'],
  ];
  for (const [max, label] of bands) {
    if (b < max) return label;
  }
  return '北';
}
const FRIEND_STATUS_LABEL = { in_flight: '飛行中', landed: '已降落', not_started: '待起飛' };
function compassFriendMarkers() {
  if (!passenger) return [];
  const origin = youCoord();
  return groupFlights
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.passengerName !== passenger.name)
    .map(({ f, idx }) => {
      let c = null;
      if (f.status === 'in_flight') {
        c = flightPlaneCoord(f)?.c;
      } else if (f.status === 'landed') {
        c = coordOf(f, 'arrivalLatitude', 'arrivalLongitude');
      } else {
        c = coordOf(f, 'departureLatitude', 'departureLongitude');
      }
      if (!c) return null;
      const bearing = bearingFromTo(origin, c);
      return {
        idx,
        name: f.passengerName,
        bearing,
        dir: bearingLabel(bearing),
        status: FRIEND_STATUS_LABEL[f.status] || f.status,
      };
    })
    .filter(Boolean);
}

// ── Globe：全畫面地球儀（D3 · CDN 失敗時優雅退化）────────────────────────────

const Globe = (() => {
  let ok = false, svg, projection, path, graticule, land = null;
  let sphereEl, gratEl, gLand, gRoute, gRouteHit, gPts, gradStops = [];
  let w = 0, h = 0, baseR = 200, k = 1;
  const HOME_ROT = [-DEFAULT_COORD[0], -20];
  let idleTimer = null, idleOn = true;
  let onFriendPick = null;
  let onPlanePick = null;
  let motionGen = 0; // 中斷 flyTo / resetView / glide
  let renderRaf = 0;
  let view = {
    you: null, friends: [], friendRoutes: [], trailRoutes: [], trailDots: [],
    heading: null, traveledKm: 0, possibilityKm: 0,
    arrival: null, routeArc: null, planeC: null, mateArc: null, mateArcs: null,
    focusPid: null,
  };

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function frameBand() {
    const stage = $('stage');
    if (!stage) return { top: 0, bottom: h, gap: h };
    const sr = stage.getBoundingClientRect();
    const head = $('board-head');
    const dock = document.querySelector('.dock');
    let top = 0;
    let bottom = h;
    if (head && head.getClientRects().length) {
      top = head.getBoundingClientRect().bottom - sr.top;
    } else {
      const hud = $('hud-top');
      if (hud && hud.getClientRects().length) {
        top = hud.getBoundingClientRect().bottom - sr.top;
      }
    }
    if (dock && dock.getClientRects().length) {
      bottom = dock.getBoundingClientRect().top - sr.top;
    }
    if (!(bottom > top + 64)) {
      return { top: h * 0.18, bottom: h * 0.78, gap: h * 0.6 };
    }
    return { top, bottom, gap: bottom - top };
  }

  /** 地球中心：落在看板底邊與 dock 頂邊的垂直正中 */
  function anchorY() {
    const { top, bottom } = frameBand();
    return (top + bottom) / 2;
  }

  function applyProjection() {
    projection.scale(baseR * k).translate([w / 2, anchorY()]);
  }

  function resize() {
    const stage = $('stage');
    w = stage.clientWidth; h = stage.clientHeight;
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    const { gap } = frameBand();
    baseR = Math.min(w * 0.72, gap * 0.46, h * 0.42);
    applyProjection();
    render();
  }

  function refreshPalette() {
    if (!ok) return;
    const stops = [cssVar('--ocean-0'), cssVar('--ocean-1'), cssVar('--ocean-2')];
    gradStops.forEach((s, i) => s.attr('stop-color', stops[i]));
    render();
  }

  function interruptMotion() {
    motionGen += 1;
  }

  /** 拖曳／縮放時合併到下一幀再畫，避免卡住感 */
  function scheduleRender() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      render();
    });
  }

  function visible(coord) {
    const r = projection.rotate();
    return d3.geoDistance(coord, [-r[0], -r[1]]) < Math.PI / 2;
  }

  function lineTo(from, to, steps = 40) {
    const ip = d3.geoInterpolate(from, to);
    return { type: 'LineString', coordinates: d3.range(0, steps + 1).map((i) => ip(i / steps)) };
  }

  // 機鼻朝上（-y）的小飛機剪影，供航向旋轉
  const PLANE_ICON = 'M0,-9 C1.6,-5.5 1.4,-3.5 1,-1.5 L8.5,3 L8.5,5.2 L1.1,3.2 L1.1,6.2 L3.6,8.4 L3.6,9.8 L0,8.8 L-3.6,9.8 L-3.6,8.4 L-1.1,6.2 L-1.1,3.2 L-8.5,5.2 L-8.5,3 L-1,-1.5 C-1.4,-3.5 -1.6,-5.5 0,-9 Z';

  function isGlobePickTarget(target) {
    let node = target;
    const root = document.getElementById('globe-svg');
    while (node && node !== root) {
      // 只擋飛機本體點選；隊友航跡 hit 區太寬，不可擋住拖曳地球
      if (node.classList?.contains('pt-pick')
        || node.classList?.contains('plane-hit')) return true;
      node = node.parentNode;
    }
    return false;
  }

  function bindPlanePickTap(selection, screenX, screenY) {
    if (!onPlanePick) {
      selection.on('pointerdown.planepick pointerup.planepick click.planepick', null);
      return;
    }
    selection
      .style('cursor', 'pointer')
      .on('pointerdown.planepick', function (ev) {
        ev.stopPropagation();
        this._planeTap = { x: ev.clientX, y: ev.clientY, sx: screenX, sy: screenY };
      })
      .on('pointerup.planepick', function (ev) {
        const tap = this._planeTap;
        this._planeTap = null;
        if (!tap) return;
        if (Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > 14) return;
        ev.stopPropagation();
        onPlanePick(tap.sx, tap.sy);
      });
  }

  function bindRoutePickTap(selection) {
    if (!onPlanePick) {
      selection.on('pointerdown.planepick pointerup.planepick', null);
      return;
    }
    selection
      .attr('class', 'route-hit')
      .style('cursor', 'pointer')
      .on('pointerdown.planepick', function (ev) {
        ev.stopPropagation();
        this._routeTap = { x: ev.clientX, y: ev.clientY };
      })
      .on('pointerup.planepick', function (ev) {
        const tap = this._routeTap;
        this._routeTap = null;
        if (!tap) return;
        if (Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > 14) return;
        ev.stopPropagation();
        onPlanePick(ev.clientX, ev.clientY);
      });
  }

  function render() {
    if (!ok) return;
    const R = projection.scale();
    const [cx, cy] = projection.translate();
    sphereEl.attr('cx', cx).attr('cy', cy).attr('r', R);
    gratEl.attr('d', path(graticule)).attr('stroke', cssVar('--grat'));

    if (land) {
      gLand.selectAll('path').data([land]).join('path')
        .attr('d', path)
        .attr('fill', cssVar('--land'))
        .attr('stroke', cssVar('--land-line'))
        .attr('stroke-width', 0.5);
    }

    // 航線圖層
    const gold = cssVar('--gold') || '#d9a63a';
    const friendCol = cssVar('--friend') || '#3b82f6';
    const routes = [];
    const youC = view.you?.c;
    if (view.routeArc) {
      routes.push({ id: 'you', d: lineTo(view.routeArc.from, view.routeArc.to), s: null, wd: 2.4, o: 1, color: gold, pick: 'you' });
    } else if (youC && view.heading != null) {
      const traveled = Math.max(view.traveledKm, 1);
      const planeC = destPoint(youC, view.heading, traveled);
      view.planeC = planeC;
      routes.push({ id: 'you', d: lineTo(youC, planeC), s: null, wd: 2.4, o: 1, color: gold, pick: 'you' });
      const hint = destPoint(youC, view.heading, traveled + 900);
      routes.push({ id: 'you-hint', d: lineTo(planeC, hint), s: '4 5', wd: 1.4, o: 0.5, color: gold, pick: 'you' });
    } else if (youC && view.possibilityKm > 0) {
      const circle = d3.geoCircle().center(youC).radius(view.possibilityKm / 111.19)();
      routes.push({ id: 'you-circle', d: circle, s: '3 5', wd: 1.3, o: 0.55, color: gold, pick: null });
      view.planeC = null;
    }
    // 歷史航跡（虛線，可切換；焦點隊友加粗）
    (view.trailRoutes || []).forEach((tr) => {
      routes.push({
        id: tr.id,
        d: lineTo(tr.from, tr.to),
        s: tr.focused ? '3 7' : '5 9',
        wd: tr.wd || 1.35,
        o: tr.o ?? 0.34,
        color: tr.mine ? gold : friendCol,
        pick: tr.pick,
        idx: tr.idx,
      });
    });
    // 隊友進行中航線（實線；非焦點時略淡）
    (view.friendRoutes || []).forEach((fr) => {
      const dim = view.focusPid && fr.passengerId && fr.passengerId !== view.focusPid;
      routes.push({
        id: 'fr' + fr.idx,
        d: lineTo(fr.from, fr.to),
        s: fr.dashed ? '5 6' : null,
        wd: fr.dashed ? 1.55 : 1.85,
        o: dim ? 0.14 : (fr.dashed ? 0.48 : 0.72),
        color: friendCol,
        pick: 'friend',
        idx: fr.idx,
      });
    });
    // 點隊友後：飛行中弧加強（歷史段由 trailRoutes 高亮）
    (view.mateArcs || []).forEach((arc, i) => {
      if (!arc.flying && view.focusPid) return;
      routes.push({
        id: 'mate-arc-' + i,
        d: lineTo(arc.from, arc.to),
        s: arc.flying ? '4 5' : '3 6',
        wd: arc.flying ? 2.4 : 2.2,
        o: 0.98,
        color: friendCol,
        pick: 'friend',
        idx: view.mateArc?.idx ?? arc.idx,
      });
    });
    if (view.mateArc && !(view.mateArcs || []).length) {
      routes.push({
        id: 'mate',
        d: lineTo(view.mateArc.from, view.mateArc.to),
        s: '5 6', wd: 2.6, o: 0.98,
        color: friendCol, pick: 'friend', idx: view.mateArc.idx,
      });
    }
    gRoute.selectAll('path').data(routes, (d) => d.id).join('path')
      .attr('d', (x) => path(x.d)).attr('fill', 'none')
      .attr('stroke', (x) => x.color || gold)
      .attr('stroke-width', (x) => x.wd)
      .attr('stroke-dasharray', (x) => x.s)
      .attr('opacity', (x) => x.o)
      .attr('stroke-linecap', 'round')
      .attr('pointer-events', 'none');

    const hitRoutes = routes.filter((r) => r.pick);
    const routeHitSel = gRouteHit.selectAll('path').data(hitRoutes, (d) => d.id).join('path')
      .attr('d', (x) => path(x.d)).attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 22)
      .attr('stroke-linecap', 'round')
      .attr('pointer-events', (x) => (x.pick === 'you' && onPlanePick) || x.pick === 'friend' ? 'stroke' : 'none');
    routeHitSel.filter((d) => d.pick === 'you' && onPlanePick).call(bindRoutePickTap);
    routeHitSel.filter((d) => d.pick === 'friend')
      .style('cursor', (d) => (Number.isInteger(d.idx) ? 'pointer' : null))
      .on('click', (ev, d) => {
        ev.stopPropagation();
        if (Number.isInteger(d.idx)) onFriendPick?.(d.idx);
      });

    // 點位圖層
    const labelInk = cssVar('--ink-soft') || '#33557f';
    const pts = [];
    if (view.you) {
      const hideYouDot = view.planeC && !view.routeArc && view.heading != null;
      if (!hideYouDot) {
        pts.push({ key: 'you', c: view.you.c, label: view.you.label, kind: 'you' });
      }
    }
    view.friends.forEach((f, i) => {
      const focused = !!(view.focusPid && f.passengerId && f.passengerId === view.focusPid);
      // 焦點軌跡時落點城市由 land-dot 顯示，避免與隊友名重疊
      const hideName = focused && (f.kind || 'friend') !== 'friend-plane';
      pts.push({
        key: 'f' + i + f.label,
        c: f.c,
        ahead: f.ahead,
        label: hideName ? '' : f.label,
        kind: f.kind || 'friend',
        idx: f.idx,
        dim: view.focusPid && f.passengerId && f.passengerId !== view.focusPid,
        focused,
      });
    });
    (view.trailDots || []).forEach((d) => {
      if (!d?.c) return;
      pts.push({
        key: d.key,
        c: d.c,
        label: d.label || '',
        kind: 'land-dot',
        mine: !!d.mine,
        focused: !!d.focused,
        faint: !!d.faint,
        bright: !!d.bright,
        showLabel: !!d.showLabel,
        idx: d.idx,
      });
    });
    if (view.mateArc && !view.focusPid) {
      pts.push({ key: 'mateDep', c: view.mateArc.from, label: view.mateArc.depLabel, kind: 'friend' });
      pts.push({ key: 'mateArr', c: view.mateArc.to, label: view.mateArc.arrLabel, kind: 'arrival' });
    }
    (view.mateArcs || []).forEach((arc, i) => {
      if (!arc.flying || !arc.to) return;
      pts.push({
        key: 'mate-land-' + i,
        c: arc.to,
        label: arc.arrLabel || '',
        kind: 'land-dot',
        focused: true,
        showLabel: false,
        idx: view.mateArc?.idx ?? arc.idx,
      });
    });
    if (view.arrival) pts.push({ key: 'arr', c: view.arrival.c, label: view.arrival.label, kind: 'arrival' });
    if (view.planeC && !view.routeArc) {
      const ahead = destPoint(youC, view.heading, Math.max(view.traveledKm, 1) + 60);
      const planeLabel = view.you?.label ? `${view.you.label.replace(/^你 · /, '')} ✈` : '你 ✈';
      pts.push({ key: 'plane', c: view.planeC, ahead, kind: 'plane', label: planeLabel });
    }
    if (view.routeArc?.planeT != null) {
      const ip = d3.geoInterpolate(view.routeArc.from, view.routeArc.to);
      const t = view.routeArc.planeT;
      const planeLabel = view.routeArc.planeLabel
        || (view.you?.label ? `${view.you.label.replace(/^你 · /, '')} ✈` : '你 ✈');
      pts.push({ key: 'plane', c: ip(t), ahead: ip(Math.min(1, t + 0.02)), kind: 'plane', label: planeLabel });
    }
    const shown = pts.filter((p) => visible(p.c));

    const sel = gPts.selectAll('g.pt').data(shown, (d) => d.key);
    const ent = sel.enter().append('g').attr('class', 'pt');
    ent.append('circle').attr('class', 'halo');
    ent.append('circle').attr('class', 'core');
    ent.append('circle').attr('class', 'plane-hit');
    ent.append('path').attr('class', 'plicon').attr('d', PLANE_ICON).attr('display', 'none');
    ent.append('text').attr('class', 'lbl');
    sel.exit().remove();

    gPts.selectAll('g.pt').each(function (d) {
      const [x, y] = projection(d.c);
      const g = d3.select(this);
      g.attr('opacity', 1);
      g.select('.plane-hit').attr('display', 'none');
      if (d.kind === 'plane') {
        g.attr('class', 'pt pt-pick');
        g.select('.halo').attr('r', 0); g.select('.core').attr('r', 0);
        let deg = 0;
        if (d.ahead) {
          const [ax, ay] = projection(d.ahead);
          deg = Math.atan2(ay - y, ax - x) * 180 / Math.PI + 90;
        }
        g.select('.plicon')
          .attr('display', null)
          .attr('transform', `translate(${x},${y}) rotate(${deg}) scale(1.15)`)
          .attr('fill', gold).attr('stroke', '#fff').attr('stroke-width', 0.6);
        g.select('.lbl').attr('x', x).attr('y', y - 13).attr('text-anchor', 'middle')
          .attr('font-size', '9px').attr('font-weight', '800')
          .attr('fill', labelInk).text(d.label || '');
        g.select('.plane-hit')
          .attr('display', null)
          .attr('cx', x).attr('cy', y).attr('r', 36)
          .attr('fill', 'transparent').attr('stroke', 'none')
          .attr('pointer-events', 'all')
          .raise();
        bindPlanePickTap(g, x, y);
        return;
      }
      if (d.kind === 'friend-plane') {
        g.attr('class', d.focused ? 'pt pt-pick' : 'pt');
        g.select('.plane-hit').attr('display', 'none');
        g.select('.halo').attr('r', 0); g.select('.core').attr('r', 0);
        g.select('.lbl').text('');
        let deg = 0;
        if (d.ahead) {
          const [ax, ay] = projection(d.ahead);
          deg = Math.atan2(ay - y, ax - x) * 180 / Math.PI + 90;
        }
        g.select('.plicon')
          .attr('display', null)
          .attr('transform', `translate(${x},${y}) rotate(${deg}) scale(${d.focused ? 1.25 : 1.15})`)
          .attr('fill', friendCol).attr('stroke', '#fff').attr('stroke-width', 0.6)
          .attr('opacity', d.dim ? 0.28 : 1);
        g.select('.lbl').attr('x', x).attr('y', y - 13).attr('text-anchor', 'middle')
          .attr('font-size', '9px').attr('font-weight', '800')
          .attr('fill', labelInk).attr('opacity', d.dim ? 0.35 : 1).text(d.label || '');
        const clickablePlane = Number.isInteger(d.idx);
        g.style('cursor', clickablePlane ? 'pointer' : null)
          .on('click', clickablePlane ? (ev) => { ev.stopPropagation(); onFriendPick?.(d.idx); } : null);
        return;
      }
      if (d.kind === 'land-dot') {
        g.attr('class', Number.isInteger(d.idx) ? 'pt pt-pick' : 'pt');
        g.select('.plicon').attr('display', 'none');
        g.select('.plane-hit').attr('display', 'none');
        const col = d.mine ? gold : friendCol;
        const faint = !!d.faint;
        const bright = !!d.bright || (!faint && !!d.focused);
        const coreR = bright ? 4.4 : (faint ? 2.1 : (d.mine ? 3.2 : 2.8));
        const groupOp = faint ? 0.12 : 1;
        g.attr('opacity', groupOp);
        g.select('.halo').attr('cx', x).attr('cy', y)
          .attr('r', bright ? 11 : (faint ? 4 : 6))
          .attr('fill', col)
          .attr('opacity', bright ? 0.32 : (faint ? 0.06 : 0.14));
        g.select('.core').attr('cx', x).attr('cy', y).attr('r', coreR)
          .attr('fill', col).attr('stroke', '#fff').attr('stroke-width', bright ? 1.5 : 0.9);
        g.select('.lbl').attr('x', x).attr('y', y - (bright ? 14 : 10)).attr('text-anchor', 'middle')
          .attr('font-size', bright ? '9px' : '8px').attr('font-weight', bright ? '700' : '600')
          .attr('fill', labelInk)
          .text(d.showLabel ? (d.label || '') : '');
        const clickableDot = Number.isInteger(d.idx);
        g.style('cursor', clickableDot ? 'pointer' : null)
          .on('click', clickableDot ? (ev) => { ev.stopPropagation(); onFriendPick?.(d.idx); } : null);
        return;
      }
      g.attr('class', 'pt');
      g.on('pointerdown.planepick pointerup.planepick click.planepick', null).style('cursor', null);
      g.select('.plicon').attr('display', 'none');
      const main = d.kind !== 'friend';
      const col = main ? gold : friendCol;
      const dim = !!d.dim;
      g.select('.halo').attr('cx', x).attr('cy', y).attr('r', main ? 10 : (d.focused ? 11 : 7))
        .attr('fill', col).attr('opacity', dim ? 0.06 : (d.focused ? 0.28 : 0.18));
      g.select('.core').attr('cx', x).attr('cy', y).attr('r', main ? 4.5 : (d.focused ? 4.2 : 3.5))
        .attr('fill', col).attr('stroke', '#fff').attr('stroke-width', 1.2)
        .attr('opacity', dim ? 0.3 : 1);
      g.select('.lbl').attr('x', x).attr('y', y - 11).attr('text-anchor', 'middle')
        .attr('font-size', '9px').attr('font-weight', main ? '800' : '600')
        .attr('fill', labelInk).attr('opacity', dim ? 0.35 : 1).text(d.label || '');
      // 可點擊的隊友點：開啟該隊友航程詳情
      const clickable = d.kind === 'friend' && Number.isInteger(d.idx);
      g.style('cursor', clickable ? 'pointer' : null)
        .on('click', clickable ? (ev) => { ev.stopPropagation(); onFriendPick?.(d.idx); } : null);
    });
  }

  function setZoom(nk, { immediate = false } = {}) {
    k = Math.max(0.62, Math.min(3.5, nk));
    applyProjection();
    if (immediate) render();
    else scheduleRender();
  }

  function flyTo(coord, duration = 1400, done) {
    if (!ok) { done?.(); return; }
    const token = ++motionGen;
    const target = [-coord[0], -coord[1] + 6];
    const r0 = projection.rotate();
    const t0 = performance.now();
    const DUR = Math.max(200, duration);
    (function frame(now) {
      if (token !== motionGen) { done?.(); return; }
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      projection.rotate([
        r0[0] + (target[0] - r0[0]) * e,
        r0[1] + (target[1] - r0[1]) * e,
      ]);
      render();
      if (p < 1) requestAnimationFrame(frame);
      else done?.();
    })(t0);
  }

  function resetView() {
    if (!ok) return;
    const token = ++motionGen;
    const k0 = k;
    const r0 = projection.rotate();
    const home = view.you ? [-view.you.c[0], -view.you.c[1] + 6] : HOME_ROT;
    const t0 = performance.now();
    const DUR = 700;
    (function frame(now) {
      if (token !== motionGen) return;
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      k = k0 + (1 - k0) * e;
      applyProjection();
      projection.rotate([
        r0[0] + (home[0] - r0[0]) * e,
        r0[1] + (home[1] - r0[1]) * e,
      ]);
      render();
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  /** 降落滑行：飛機沿弧線滑至落點，鏡頭跟隨 */
  function glideToArrival(fromC, toC, done) {
    if (!ok) { done?.(); return; }
    const token = ++motionGen;
    view.routeArc = { from: fromC, to: toC, planeT: 0 };
    view.heading = null; view.possibilityKm = 0;
    const rot0 = projection.rotate();
    const target = [-toC[0], -toC[1] + 6];
    const t0 = performance.now(), DUR = 2100;
    (function frame(now) {
      if (token !== motionGen) { done?.(); return; }
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      view.routeArc.planeT = e;
      projection.rotate([rot0[0] + (target[0] - rot0[0]) * e, rot0[1] + (target[1] - rot0[1]) * e]);
      render();
      if (p < 1) requestAnimationFrame(frame);
      else { view.routeArc.planeT = null; render(); done?.(); }
    })(t0);
  }

  function gestures() {
    const el = document.getElementById('globe-svg');
    const touches = new Map();
    let pinch = 0, lastTap = 0;
    let dragging = false;

    const clearPointer = (pointerId) => {
      touches.delete(pointerId);
      try { if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId); } catch { /* noop */ }
      if (touches.size < 2) pinch = 0;
      if (!touches.size) dragging = false;
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      // 飛機點選保留；航跡 hit 不擋拖曳
      if (isGlobePickTarget(e.target)) return;
      interruptMotion();
      const now = Date.now();
      if (now - lastTap < 280 && touches.size === 0 && !dragging) {
        resetView();
        lastTap = 0;
        return;
      }
      lastTap = now;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      dragging = false;
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
      try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });

    el.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      const prev = touches.get(e.pointerId);
      const next = [e.clientX, e.clientY];
      touches.set(e.pointerId, next);
      const moved = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      if (moved > 2) dragging = true;

      if (touches.size === 1) {
        const r = projection.rotate();
        const f = 0.35 / k;
        projection.rotate([
          r[0] + (next[0] - prev[0]) * f,
          Math.max(-75, Math.min(75, r[1] - (next[1] - prev[1]) * f)),
        ]);
        scheduleRender();
      } else if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 8) setZoom(k * (d / pinch));
        pinch = d;
      }
    });

    const end = (e) => { clearPointer(e.pointerId); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      interruptMotion();
      const factor = Math.exp(-e.deltaY * 0.0016);
      setZoom(k * Math.min(1.2, Math.max(0.83, factor)));
    }, { passive: false });

    el.addEventListener('dblclick', (e) => e.preventDefault());

    // 頁面失焦／切換時清掉殘留觸點，避免「卡住不能轉」
    window.addEventListener('blur', () => {
      [...touches.keys()].forEach(clearPointer);
      pinch = 0;
      dragging = false;
    });

    idleTimer = d3.interval(() => {
      if (!idleOn || touches.size) return;
      const r = projection.rotate();
      projection.rotate([r[0] + 0.04, r[1]]);
      render();
    }, 40);
  }

  function init() {
    if (!window.d3 || !window.topojson) {
      $('stage').classList.add('no-globe');
      return;
    }
    ok = true;
    svg = d3.select('#globe-svg');
    projection = d3.geoOrthographic().rotate(HOME_ROT);
    path = d3.geoPath(projection);
    graticule = d3.geoGraticule10();

    const defs = svg.append('defs');
    const grad = defs.append('radialGradient').attr('id', 'oceanGrad').attr('cx', '38%').attr('cy', '30%');
    gradStops = [
      grad.append('stop').attr('offset', '0%'),
      grad.append('stop').attr('offset', '68%'),
      grad.append('stop').attr('offset', '100%'),
    ];
    sphereEl = svg.append('circle').attr('fill', 'url(#oceanGrad)').attr('stroke', 'rgba(120,150,190,0.35)');
    gratEl = svg.append('path').attr('fill', 'none').attr('stroke-width', 0.5);
    gLand = svg.append('g');
    gRoute = svg.append('g');
    gRouteHit = svg.append('g');
    gPts = svg.append('g');

    new ResizeObserver(resize).observe($('stage'));
    const chromeRo = new ResizeObserver(() => resize());
    const boardHead = $('board-head');
    const dockEl = document.querySelector('.dock');
    if (boardHead) chromeRo.observe(boardHead);
    if (dockEl) chromeRo.observe(dockEl);
    resize();
    refreshPalette();
    gestures();

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((r) => r.json())
      .then((topo) => { land = topojson.feature(topo, topo.objects.land); render(); })
      .catch(() => { /* 離線：僅顯示海洋球體與經緯線 */ });
  }

  return {
    init,
    refreshPalette,
    flyTo,
    glideToArrival,
    resetView,
    setIdle(on) { idleOn = on; },
    update(patch) { Object.assign(view, patch); render(); },
    clearRoute() { Object.assign(view, { heading: null, traveledKm: 0, possibilityKm: 0, routeArc: null, planeC: null, arrival: null }); render(); },
    setFriendPick(fn) { onFriendPick = fn; },
    setPlanePick(fn) { onPlanePick = fn; render(); },
    /** 高亮某位隊友的完整航跡（多段弧 + 降落點），並把鏡頭轉到旅程中心 */
    focusMateJourney({ from, to, arrLabel, depLabel, idx, pid, arcs }) {
      view.focusPid = pid || null;
      view.mateArc = from && to ? { from, to, arrLabel, depLabel, idx } : null;
      view.mateArcs = Array.isArray(arcs) && arcs.length ? arcs : null;
      view.heading = null; view.possibilityKm = 0; view.routeArc = null;
      idleOn = false;
      render();
      const focusPts = [];
      (view.mateArcs || []).forEach((a) => {
        if (a.from) focusPts.push(a.from);
        if (a.to) focusPts.push(a.to);
      });
      if (from) focusPts.push(from);
      if (to) focusPts.push(to);
      if (ok && focusPts.length) {
        const mid = focusPts.length === 1
          ? focusPts[0]
          : d3.geoInterpolate(focusPts[0], focusPts[focusPts.length - 1])(0.5);
        flyTo(mid, 900);
      }
    },
    /** @deprecated 單段高亮；請優先用 focusMateJourney */
    focusMate(from, to, arrLabel, depLabel, idx) {
      this.focusMateJourney({ from, to, arrLabel, depLabel, idx, arcs: from && to ? [{ from, to, arrLabel, depLabel, idx }] : [] });
    },
    clearMate() {
      view.mateArc = null;
      view.mateArcs = null;
      view.focusPid = null;
      render();
    },
    get ok() { return ok; },
  };
})();

// ── Compass：古典航海羅盤 sheet ───────────────────────────────────────────────

const Compass = (() => {
  const DIRS = [
    { a: 0, key: 'northbound' }, { a: 45, key: 'northeast' },
    { a: 90, key: 'eastbound' }, { a: 135, key: 'southeast' },
    { a: 180, key: 'southbound' }, { a: 225, key: 'southwest' },
    { a: 270, key: 'westbound' }, { a: 315, key: 'northwest' },
  ];
  const NS = 'http://www.w3.org/2000/svg';
  let needle = null, friendLayer = null, current = 'auto', angle = 0, dragging = false, spinning = false;
  let lastTickStep = 0;
  let lastTickDir = null;

  function tickStepOf(a) {
    return Math.round((((a % 360) + 360) % 360) / 15) % 24;
  }

  function playNeedleTick(a, { forceMajor = false } = {}) {
    const step = tickStepOf(a);
    const dir = nearest(a).key;
    const crossedTick = step !== lastTickStep;
    const crossedDir = dir !== lastTickDir;
    if (!crossedTick && !crossedDir && !forceMajor) return;
    lastTickStep = step;
    const major = forceMajor || crossedDir || step % 3 === 0;
    if (crossedDir) lastTickDir = dir;
    BroadcastAudio?.playCompassTick?.({ major });
  }

  function el(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function nearest(a) {
    a = ((a % 360) + 360) % 360;
    let best = DIRS[0], bd = 999;
    for (const d of DIRS) {
      const diff = Math.abs(((a - d.a + 540) % 360) - 180);
      if (diff < bd) { bd = diff; best = d; }
    }
    return best;
  }

  function readout() {
    const dirEl = $('compass-dir'), hintEl = $('compass-hint');
    const chip = $('dir-chip-label');
    if (current === 'auto') {
      dirEl.textContent = '自動';
      hintEl.textContent = '由系統為你選擇方向';
      if (chip) chip.textContent = '方向';
    } else {
      dirEl.textContent = DIRECTION_LABEL[current];
      hintEl.textContent = `今晚傾向醒在${DIRECTION_LABEL[current]}方的城市`;
      if (chip) chip.textContent = DIRECTION_LABEL[current];
    }
    needle?.setAttribute('opacity', current === 'auto' ? '0.35' : '1');
  }

  function setNeedle(a) {
    angle = a;
    needle?.setAttribute('transform', `rotate(${a} 120 120)`);
  }

  function pick(a, snap = true) {
    const d = nearest(a);
    current = d.key;
    if (snap) animateTo(d.a, 0);
    readout();
  }

  function animateTo(target, spins) {
    if (spinning) return;
    let delta = (((target - angle) % 360) + 360) % 360;
    if (delta > 180 && spins === 0) delta -= 360;
    const end = angle + delta + spins * 360;
    const start = angle, dur = spins > 0 ? 1600 : 380, t0 = performance.now();
    spinning = true;
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setNeedle(start + (end - start) * e);
      if (p < 1) requestAnimationFrame(frame);
      else { angle = ((end % 360) + 360) % 360; spinning = false; readout(); }
    })(t0);
  }

  function build() {
    const svg = $('compass-svg');
    svg.innerHTML = '';
    const grad = el('radialGradient', { id: 'cGrad', cx: '50%', cy: '45%', r: '55%' });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(255,255,255,0.3)' }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(255,255,255,0.05)' }));
    const defs = el('defs', {}); defs.appendChild(grad); svg.appendChild(defs);

    svg.appendChild(el('circle', { cx: 120, cy: 120, r: 112, fill: 'url(#cGrad)', stroke: '#c9962f', 'stroke-width': 2 }));
    svg.appendChild(el('circle', { cx: 120, cy: 120, r: 98, fill: 'none', stroke: 'rgba(201,150,47,0.45)', 'stroke-width': 1 }));

    for (let d = 0; d < 360; d += 15) {
      const major = d % 45 === 0;
      const r1 = 98, r2 = major ? 86 : 92, rad = toRad(d - 90);
      svg.appendChild(el('line', {
        x1: 120 + r1 * Math.cos(rad), y1: 120 + r1 * Math.sin(rad),
        x2: 120 + r2 * Math.cos(rad), y2: 120 + r2 * Math.sin(rad),
        stroke: 'rgba(201,150,47,0.6)', 'stroke-width': major ? 2 : 1,
      }));
    }

    const letters = [['N', 120, 18, 14], ['S', 120, 232, 11], ['E', 228, 125, 11], ['W', 12, 125, 11]];
    for (const [t, x, y, s] of letters) {
      const txt = el('text', {
        x, y, 'text-anchor': 'middle', fill: t === 'N' ? '#c9962f' : 'rgba(201,150,47,0.8)',
        'font-size': s, 'font-weight': 700, 'font-family': 'Georgia,serif',
      });
      txt.textContent = t;
      svg.appendChild(txt);
    }

    friendLayer = el('g', { class: 'compass-friend-layer' });
    svg.appendChild(friendLayer);

    // 八方位熱點
    for (const d of DIRS) {
      const rad = toRad(d.a - 90);
      const hot = el('circle', {
        cx: 120 + 72 * Math.cos(rad), cy: 120 + 72 * Math.sin(rad),
        r: 17, fill: 'transparent',
      });
      hot.style.cursor = 'pointer';
      hot.addEventListener('click', (e) => {
        e.stopPropagation();
        BroadcastAudio?.primeFromUserGesture?.();
        current = d.key;
        playNeedleTick(d.a, { forceMajor: true });
        animateTo(d.a, 0);
        readout();
      });
      svg.appendChild(hot);
    }

    // 磁針
    needle = el('g', { transform: 'rotate(0 120 120)' });
    needle.appendChild(el('polygon', { points: '120,36 127,120 120,127 113,120', fill: '#e0563f' }));
    needle.appendChild(el('polygon', { points: '120,36 113,120 120,127', fill: '#c0432f' }));
    needle.appendChild(el('polygon', { points: '120,204 127,120 120,113 113,120', fill: '#d9b86a' }));
    needle.appendChild(el('polygon', { points: '120,204 113,120 120,113', fill: '#b8933f' }));
    svg.appendChild(needle);
    svg.appendChild(el('circle', { cx: 120, cy: 120, r: 10, fill: 'rgba(255,255,255,0.85)', stroke: '#c9962f', 'stroke-width': 1.5 }));
    svg.appendChild(el('circle', { cx: 120, cy: 120, r: 3, fill: '#c9962f' }));

    // 拖曳
    const holder = $('compass-holder');
    const angleOf = (ev) => {
      const r = svg.getBoundingClientRect();
      return (Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180 / Math.PI + 360) % 360;
    };
    holder.addEventListener('pointerdown', (ev) => {
      if (spinning) return;
      BroadcastAudio?.primeFromUserGesture?.();
      dragging = true;
      holder.setPointerCapture(ev.pointerId);
      const a = angleOf(ev);
      lastTickStep = tickStepOf(a);
      lastTickDir = nearest(a).key;
      setNeedle(a);
      current = lastTickDir;
      readout();
      playNeedleTick(a, { forceMajor: true });
    });
    holder.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const a = angleOf(ev);
      setNeedle(a);
      current = nearest(a).key;
      readout();
      playNeedleTick(a);
    });
    holder.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      pick(angle);
      playNeedleTick(nearest(angle).a, { forceMajor: true });
    });

    readout();
    refreshFriends();
  }

  function refreshFriends() {
    if (!friendLayer) return;
    friendLayer.innerHTML = '';
    const friends = compassFriendMarkers();
    const legend = $('compass-friends-legend');
    const friendCol = getComputedStyle(document.body).getPropertyValue('--friend').trim() || '#3b82f6';

    friends.forEach((f) => {
      const rad = toRad(f.bearing - 90);
      const cx = 120 + 78 * Math.cos(rad);
      const cy = 120 + 78 * Math.sin(rad);
      const g = el('g', { class: 'compass-friend-mark' });
      const title = el('title', {});
      title.textContent = `${f.name} · ${f.dir}方 · ${f.status}`;
      g.appendChild(title);
      g.appendChild(el('circle', {
        cx, cy, r: 9,
        fill: friendCol, stroke: '#fff', 'stroke-width': 1.2, opacity: 0.95,
      }));
      const initial = el('text', {
        x: cx, y: cy + 3.5, 'text-anchor': 'middle',
        fill: '#fff', 'font-size': 8, 'font-weight': 800, 'font-family': 'system-ui,sans-serif',
      });
      initial.textContent = f.name.slice(0, 1);
      g.appendChild(initial);
      friendLayer.appendChild(g);
    });

    if (!legend) return;
    if (!friends.length) {
      legend.hidden = true;
      legend.innerHTML = '';
      return;
    }
    legend.hidden = false;
    legend.innerHTML = `
      <div class="compass-friends-title">小隊雷達 · 好友方位</div>
      <ul class="compass-friends-list">
        ${friends.map((f) => `
          <li><span class="compass-friend-dot" aria-hidden="true"></span>
            <span>${escHtml(f.name)}</span>
            <span class="compass-friend-dir">${f.dir}方</span>
            <span class="compass-friend-status">${escHtml(f.status)}</span>
          </li>`).join('')}
      </ul>`;
  }

  function fate() {
    const d = DIRS[Math.floor(Math.random() * DIRS.length)];
    current = d.key;
    animateTo(d.a, 2);
  }

  function reset() { current = 'auto'; readout(); }

  function confirm() {
    $('tk-direction').value = current;
    updateGlobeForReady();
    takeoffArmed = true;
    syncTakeoffButton();
    closeSheets();
  }

  return { build, fate, reset, confirm, refreshFriends, get value() { return current; } };
})();

// ── Sheet 管理 ───────────────────────────────────────────────────────────────

function syncTakeoffButton() {
  const btn = $('btn-takeoff');
  if (!btn) return;
  const icon = btn.querySelector('.pill-icon');
  const label = btn.querySelector('.pill-label');
  if (takeoffArmed) {
    if (icon) icon.textContent = '✈';
    if (label) label.textContent = '起飛';
    btn.setAttribute('aria-label', '起飛');
  } else {
    if (icon) icon.textContent = '🧭';
    if (label) label.textContent = '準備啟航';
    btn.setAttribute('aria-label', '準備啟航，選擇航向');
  }
}

function syncLandButton() {
  const btn = $('btn-land');
  if (!btn) return;
  const icon = btn.querySelector('.pill-icon');
  const label = btn.querySelector('.pill-label');
  btn.classList.toggle('is-confirm', landArmed);
  if (landArmed) {
    if (icon) icon.textContent = '✓';
    if (label) label.textContent = '確定降落';
    btn.setAttribute('aria-label', '再按一次確定降落');
  } else {
    if (icon) icon.textContent = '🌅';
    if (label) label.textContent = '降落';
    btn.setAttribute('aria-label', '降落');
  }
}

function resetTakeoffPrep() {
  takeoffArmed = false;
  syncTakeoffButton();
}

function resetLandPrep() {
  landArmed = false;
  syncLandButton();
}

function isLandedPanelVisible() {
  if (!passenger || passenger.status === 'in_flight') return false;
  return !!lastLandedFlight && !$('landed-panel')?.dataset.dismissed;
}

function canPickCompass() {
  return !!passenger && passenger.status !== 'in_flight' && !isLandedPanelVisible();
}

function takeoffBlockedHint() {
  if (!passenger) return '請先登入後再起飛。';
  if (passenger.status === 'in_flight') return '你已在飛行中，請按「降落」。';
  if (isLandedPanelVisible()) return '請先點「準備下一趟」，再選航向起飛。';
  return '目前無法選擇航向，請重新整理頁面後再試。';
}

function onTakeoffClick() {
  if (!takeoffArmed) {
    if (!canPickCompass()) {
      showMsg('main', 'error', takeoffBlockedHint());
      return;
    }
    if (
      document.body.classList.contains('sheet-open')
      && $('compass-sheet')?.classList.contains('show')
    ) {
      showMsg('main', 'error', '羅盤已開啟：請選好航向後按「確認航向」。');
      return;
    }
    openSheet('compass-sheet');
    return;
  }
  if (previewMode) {
    showMsg('main', 'error', '示範模式無法真正起飛。請登出後登入，再測試起飛。');
    return;
  }
  primeMediaOnUserGesture();
  void doTakeoff();
}

/** iOS Safari：必須在使用者點擊當下同步解鎖，不可 void async unlockMedia */
function primeMediaOnUserGesture() {
  BroadcastAudio?.primeFromUserGesture?.();
}

async function ensureMediaUnlocked() {
  primeMediaOnUserGesture();
  await BroadcastAudio?.unlockMedia?.();
}

function onLandClick() {
  if (previewMode) {
    showMsg('main', 'error', '示範模式無法降落。請登出後登入，再測試降落。');
    return;
  }
  if (passenger?.status !== 'in_flight') {
    showMsg('main', 'error', '目前沒有飛行中的航班。');
    resetLandPrep();
    return;
  }
  if (document.body.classList.contains('sheet-open')) {
    showMsg('main', 'error', '請先收起隊友詳情（點背景或 Esc），再按降落。');
    return;
  }
  if (!landArmed) {
    landArmed = true;
    syncLandButton();
    clearMsg('main');
    showMsg('main', 'success', '再按一次「確定降落」開始下降。');
    return;
  }
  primeMediaOnUserGesture();
  resetLandPrep();
  void doLand();
}

function openSheet(id) {
  if (id === 'compass-sheet' && !canPickCompass()) return;
  $('sheet-mask').classList.add('show');
  $(id).classList.add('show');
  document.body.classList.add('sheet-open');
  document.body.dataset.openSheet = id;
  if (id === 'compass-sheet') Compass.refreshFriends();
}
function closeSheets() {
  $('sheet-mask')?.classList.remove('show');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
  document.body.classList.remove('sheet-open');
  delete document.body.dataset.openSheet;
  globeFocusPid = null;
  Globe.clearMate();
  restoreGlobeView();
}

function restoreGlobeView() {
  if (!passenger) { Globe.setIdle(true); return; }
  Globe.setIdle(false);
  if (passenger.status === 'in_flight' && activeFlight) updateGlobeForFlight();
  else updateGlobeForReady();
}

// ── 訊息（toast / 登入卡內）──────────────────────────────────────────────────

function showMsg(prefix, type, text) {
  const el = $(prefix + '-' + type);
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 7000);
}
function clearMsg(prefix) {
  ['error', 'success'].forEach((t) => $(prefix + '-' + t)?.classList.remove('show'));
}

// ── 格式化 ───────────────────────────────────────────────────────────────────

function fmtDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h} 小時 ${String(mm).padStart(2, '0')} 分` : `${mm} 分鐘`;
}
function minutesSince(iso) {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
}
function cityOnly(loc) { return (loc || '').split(',')[0].trim(); }
function codeify(loc) {
  const s = cityOnly(loc).replace(/[^A-Za-z]/g, '').toUpperCase();
  return (s.slice(0, 3) || 'ZZZ').padEnd(3, 'X');
}
function avatarColor(name) {
  let hsh = 0;
  for (const ch of String(name)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hsh % AVATAR_COLORS.length];
}

// ── API Helper（workshop-local 相容）─────────────────────────────────────────

async function api(method, url, body, { timeoutMs = 0 } = {}) {
  if (window.WorkshopLocal?.isActive()) {
    return WorkshopLocal.handle(method, url, body);
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  if (controller) opts.signal = controller.signal;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (controller?.signal.aborted) {
      throw new Error('伺服器回應逾時。請稍後再試，或重新整理頁面確認航班狀態。');
    }
    if (window.WorkshopLocal?.allowLocalFallback?.()) {
      WorkshopLocal.enable();
      return WorkshopLocal.handle(method, url, body);
    }
    if (err instanceof TypeError || err.message === 'Failed to fetch') {
      throw new Error('無法連線後端。本機預覽請確認 workshop-local.js 已載入；或執行 npm run dev 後開 http://localhost:3000');
    }
    throw err;
  }
  if (timer) clearTimeout(timer);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 504) {
      throw new Error('伺服器處理逾時（504）。請重新整理後查看航班狀態，必要時再試一次。');
    }
    throw new Error(res.ok ? '伺服器回應格式錯誤，請稍後再試。' : (text.slice(0, 120) || `伺服器錯誤 (${res.status})`));
  }
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error(data.message || data.error || '伺服器處理逾時（504）。請重新整理後查看航班狀態，必要時再試一次。');
    }
    throw new Error(data.message || data.error || `伺服器錯誤 (${res.status})`);
  }
  return data;
}

// ── 地球儀資料同步 ────────────────────────────────────────────────────────────

function flightPlaneCoord(f) {
  const dep = coordOf(f, 'departureLatitude', 'departureLongitude');
  if (!dep) return null;
  const pred = predictFlightArrival(f);
  if (pred) {
    const c = interpolateRoute(pred.from, pred.to, pred.planeT);
    const ahead = interpolateRoute(pred.from, pred.to, Math.min(1, pred.planeT + 0.02));
    return { c, km: pred.km, ahead, predictedTo: pred.to, predictedLabel: pred.label };
  }
  const bearing = routeBearing(f.routeDirection);
  const km = minutesSince(f.takeoffTime) * KM_PER_MINUTE;
  if (bearing == null) return { c: dep, km: 0 };
  const traveled = Math.max(km, 1);
  return { c: destPoint(dep, bearing, traveled), km: traveled, ahead: destPoint(dep, bearing, traveled + 60) };
}

function buildFriendRoutes() {
  if (!passenger) return [];
  return groupFlights
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.passengerName !== passenger.name && f.status === 'in_flight')
    .map(({ f, idx }) => {
      const dep = coordOf(f, 'departureLatitude', 'departureLongitude');
      if (!dep) return null;
      const pos = flightPlaneCoord(f);
      if (!pos) return null;
      return {
        idx,
        from: dep,
        to: pos.c,
        dashed: false,
        label: f.passengerName,
        passengerId: f.passengerId || `name:${f.passengerName}`,
      };
    })
    .filter(Boolean);
}

function loadTrailStore() {
  try { return JSON.parse(localStorage.getItem(TRAILS_KEY) || '{}'); }
  catch { return {}; }
}
function saveTrailStore(store) {
  try { localStorage.setItem(TRAILS_KEY, JSON.stringify(store)); } catch { /* full */ }
}
function trailRecordFromFlight(f) {
  const from = coordOf(f, 'departureLatitude', 'departureLongitude');
  const to = coordOf(f, 'arrivalLatitude', 'arrivalLongitude');
  if (!from || !to) return null;
  return {
    id: String(f.flightId || f.notionId || `${f.passengerId}-${f.landingTime || f.takeoffTime}`),
    passengerId: f.passengerId,
    passengerName: f.passengerName,
    from, to,
    depLabel: cityOnly(f.departureLocation),
    arrLabel: cityOnly(f.arrivalLocation),
    landingTime: f.landingTime || f.takeoffTime,
  };
}
function archiveFlightTrail(f) {
  if (!passenger || !f?.passengerId || f.status !== 'landed') return;
  const rec = trailRecordFromFlight(f);
  if (!rec) return;
  const store = loadTrailStore();
  const gkey = passenger.groupId;
  if (!store[gkey]) store[gkey] = {};
  if (!store[gkey][f.passengerId]) store[gkey][f.passengerId] = [];
  const list = store[gkey][f.passengerId];
  if (!list.some((t) => t.id === rec.id)) list.unshift(rec);
  store[gkey][f.passengerId] = list.slice(0, 30);
  saveTrailStore(store);
}
function archiveGroupTrails(flights) {
  if (!passenger || !Array.isArray(flights)) return;
  flights.filter((f) => f.status === 'landed').forEach(archiveFlightTrail);
}

/** 取得某位乘客的歷史航跡（最多最近 5 段） */
function getTrailsForPassenger(pid, name) {
  if (!passenger) return [];
  return collectPassengerTrailRecords(pid, name);
}

/** 地圖上每人最多顯示最近幾段航跡 */
const TRAIL_DISPLAY_LIMIT = 5;

function sortTrailRecords(trails) {
  return [...(trails || [])].sort((a, b) =>
    String(a.landingTime || a.id || '').localeCompare(String(b.landingTime || b.id || '')),
  );
}

function takeRecentTrails(sortedAsc) {
  if (!sortedAsc?.length) return [];
  return sortedAsc.slice(-TRAIL_DISPLAY_LIMIT);
}

function trailStyle(isMe, focused, isLatest) {
  // 只有最後一段亮；更早的幾乎隱形
  if (focused) {
    if (isLatest) return { o: 0.95, wd: 2.3, focused: true, faint: false, bright: true };
    return { o: 0.1, wd: 1.1, focused: true, faint: true, bright: false };
  }
  if (globeFocusPid) return { o: 0.05, wd: 1, focused: false, faint: true, bright: false };
  if (isMe) {
    if (isLatest) return { o: 0.58, wd: 1.75, focused: false, faint: false, bright: true };
    return { o: 0.06, wd: 1.05, focused: false, faint: true, bright: false };
  }
  if (isLatest) return { o: 0.32, wd: 1.35, focused: false, faint: false, bright: false };
  return { o: 0.08, wd: 1.1, focused: false, faint: true, bright: false };
}

/** 合併 store + 看板，回傳時間升序且最多 5 段 */
function collectPassengerTrailRecords(pid, name) {
  const byId = new Map();
  const push = (rec) => {
    if (!rec?.from || !rec?.to || !rec.id) return;
    if (!byId.has(rec.id)) byId.set(rec.id, rec);
  };
  if (previewMode) {
    groupFlights
      .filter((f) => f.status === 'landed')
      .filter((f) => (pid && f.passengerId === pid) || (name && f.passengerName === name)
        || (pid && `name:${f.passengerName}` === pid))
      .forEach((f) => push(trailRecordFromFlight(f)));
  } else {
    const store = loadTrailStore();
    const group = store[passenger.groupId] || {};
    if (pid && group[pid]) (group[pid] || []).forEach(push);
    groupFlights
      .filter((f) => f.status === 'landed')
      .filter((f) => (pid && f.passengerId === pid) || (name && f.passengerName === name))
      .forEach((f) => push(trailRecordFromFlight(f)));
  }
  return takeRecentTrails(sortTrailRecords([...byId.values()]));
}

let globeFocusPid = null;

function buildTrailRoutes() {
  if (!passenger) return [];
  const focusPid = globeFocusPid;
  const routes = [];
  const seenPid = new Set();

  const emitForPassenger = (pid, name, boardIdx) => {
    if (seenPid.has(pid)) return;
    seenPid.add(pid);
    const isMe = pid === passenger.passengerId
      || (name && name === passenger.name)
      || pid === `name:${passenger.name}`;
    const focused = !!(focusPid && (pid === focusPid || name === focusPid || `name:${name}` === focusPid));
    if (isMe && !routeTrails.mine && !focused) return;
    if (!isMe && !routeTrails.friends && !focused) return;
    const trails = collectPassengerTrailRecords(pid, name);
    const idx = Number.isInteger(boardIdx)
      ? boardIdx
      : groupFlights.findIndex((f) => f.passengerId === pid || f.passengerName === name);
    trails.forEach((t, ti) => {
      if (!t.from || !t.to) return;
      const isLatest = ti === trails.length - 1;
      const st = trailStyle(isMe, focused, isLatest);
      routes.push({
        id: `trail-${pid}-${t.id || ti}`,
        from: t.from,
        to: t.to,
        mine: isMe,
        passengerId: pid,
        o: st.o,
        wd: st.wd,
        focused: st.focused,
        faint: st.faint,
        bright: st.bright,
        isLatest,
        pick: !isMe && idx >= 0 ? 'friend' : null,
        idx: idx >= 0 ? idx : null,
      });
    });
  };

  if (previewMode) {
    groupFlights.forEach((f, idx) => {
      if (f.status !== 'landed') return;
      const isMe = f.passengerName === passenger.name;
      const pid = f.passengerId || (isMe ? passenger.passengerId : `name:${f.passengerName}`);
      emitForPassenger(pid, f.passengerName, idx);
    });
    return routes;
  }

  const store = loadTrailStore();
  const group = store[passenger.groupId] || {};
  Object.keys(group).forEach((pid) => {
    const name = group[pid]?.[0]?.passengerName
      || groupFlights.find((f) => f.passengerId === pid)?.passengerName;
    emitForPassenger(pid, name);
  });
  groupFlights.forEach((f, idx) => {
    if (f.status !== 'landed' || !f.passengerId) return;
    emitForPassenger(f.passengerId, f.passengerName, idx);
  });
  return routes;
}

/** 每個降落點一個圓點；只亮最後一點，最多 5 段 */
function buildTrailDots() {
  if (!passenger) return [];
  const focusPid = globeFocusPid;
  const dots = [];
  const seenPid = new Set();

  const emitForPassenger = (pid, name, boardIdx) => {
    if (seenPid.has(pid)) return;
    seenPid.add(pid);
    const isMe = pid === passenger.passengerId
      || (name && name === passenger.name)
      || pid === `name:${passenger.name}`;
    const focused = !!(focusPid && (pid === focusPid || name === focusPid || `name:${name}` === focusPid));
    if (isMe && !routeTrails.mine && !focused) return;
    if (!isMe && !routeTrails.friends && !focused) return;
    const trails = collectPassengerTrailRecords(pid, name);
    const idx = Number.isInteger(boardIdx)
      ? boardIdx
      : groupFlights.findIndex((f) => f.passengerId === pid || f.passengerName === name);
    trails.forEach((t, ti) => {
      if (!t.to) return;
      const isLatest = ti === trails.length - 1;
      const place = t.arrLabel || '';
      const mateName = t.passengerName || name || '';
      const displayLabel = focused
        ? (isLatest && mateName ? `${mateName} · ${place}` : place)
        : place;
      // 焦點時也只標最新一點，避免整條都一樣搶眼
      const showLabel = !!(focused && isLatest && displayLabel);
      const faint = !isLatest;
      const bright = !!isLatest && (isMe || focused);
      dots.push({
        key: `land-${pid}-${t.id || ti}`,
        c: t.to,
        label: displayLabel,
        mine: isMe,
        passengerId: pid,
        idx: idx >= 0 ? idx : null,
        focused: !!focused,
        isLatest,
        faint,
        bright,
        showLabel,
      });
    });
  };

  if (previewMode) {
    groupFlights.forEach((f, idx) => {
      if (f.status !== 'landed') return;
      const isMe = f.passengerName === passenger.name;
      const pid = f.passengerId || (isMe ? passenger.passengerId : `name:${f.passengerName}`);
      emitForPassenger(pid, f.passengerName, idx);
    });
    return dots;
  }

  const store = loadTrailStore();
  const group = store[passenger.groupId] || {};
  Object.keys(group).forEach((pid) => {
    const name = group[pid]?.[0]?.passengerName
      || groupFlights.find((f) => f.passengerId === pid)?.passengerName;
    emitForPassenger(pid, name);
  });
  groupFlights.forEach((f, idx) => {
    if (f.status !== 'landed' || !f.passengerId) return;
    emitForPassenger(f.passengerId, f.passengerName, idx);
  });
  return dots;
}
function syncTrailControls() {
  const bar = $('globe-trails');
  if (bar) bar.classList.toggle('hidden', !passenger);
  const mineBtn = $('trail-mine');
  const friendsBtn = $('trail-friends');
  mineBtn?.classList.toggle('is-on', routeTrails.mine);
  friendsBtn?.classList.toggle('is-on', routeTrails.friends);
  mineBtn?.setAttribute('aria-pressed', String(routeTrails.mine));
  friendsBtn?.setAttribute('aria-pressed', String(routeTrails.friends));
}
function refreshGlobeTrails() {
  if (!passenger) return;
  if (passenger.status === 'in_flight' && activeFlight) updateGlobeForFlight();
  else updateGlobeForReady();
}
function toggleRouteTrail(key) {
  routeTrails[key] = !routeTrails[key];
  syncTrailControls();
  refreshGlobeTrails();
}

function friendsFromBoard() {
  if (!passenger) return [];
  return groupFlights
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.passengerName !== passenger.name)
    .map(({ f, idx }) => {
      const passengerId = f.passengerId || `name:${f.passengerName}`;
      if (f.status === 'in_flight') {
        const pos = flightPlaneCoord(f);
        if (!pos) return null;
        return {
          c: pos.c, ahead: pos.ahead,
          label: f.passengerName + ' ✈',
          kind: 'friend-plane', idx, passengerId,
        };
      }
      const c = f.status === 'landed'
        ? coordOf(f, 'arrivalLatitude', 'arrivalLongitude')
        : coordOf(f, 'departureLatitude', 'departureLongitude');
      return c ? { c, label: f.passengerName, kind: 'friend', idx, passengerId } : null;
    })
    .filter(Boolean);
}

function youCoord() {
  return coordOf(passenger, 'currentLatitude', 'currentLongitude') || DEFAULT_COORD;
}

function globeTrailPatch() {
  return {
    friends: friendsFromBoard(),
    friendRoutes: buildFriendRoutes(),
    trailRoutes: buildTrailRoutes(),
    trailDots: buildTrailDots(),
    focusPid: globeFocusPid,
  };
}

function updateGlobeForReady() {
  if (!passenger) return;
  const dir = $('tk-direction').value;
  const bearing = DIRECTION_BEARING[dir];
  Globe.update({
    you: { c: youCoord(), label: `你 · ${cityOnly(passenger.currentLocation)}` },
    ...globeTrailPatch(),
    heading: bearing ?? null,
    traveledKm: bearing != null ? 260 : 0,
    possibilityKm: bearing == null ? 700 : 0,
    routeArc: null, arrival: null,
  });
}

function updateGlobeForFlight() {
  if (!activeFlight) return;
  const dep = coordOf(activeFlight, 'departureLatitude', 'departureLongitude') || youCoord();
  const pred = predictFlightArrival(activeFlight);
  if (pred) {
    Globe.update({
      you: { c: dep, label: cityOnly(activeFlight.departureLocation) },
      ...globeTrailPatch(),
      heading: null,
      traveledKm: 0,
      possibilityKm: 0,
      routeArc: {
        from: pred.from,
        to: pred.to,
        planeT: pred.planeT,
        planeLabel: `${cityOnly(passenger.currentLocation) || '你'} ✈`,
      },
      arrival: { c: pred.to, label: `將抵 · ${pred.label}` },
    });
    return;
  }
  const bearing = routeBearing(activeFlight.routeDirection);
  const km = minutesSince(activeFlight.takeoffTime) * KM_PER_MINUTE;
  Globe.update({
    you: { c: dep, label: cityOnly(activeFlight.departureLocation) },
    ...globeTrailPatch(),
    heading: bearing,
    traveledKm: km,
    possibilityKm: 0,
    routeArc: null, arrival: null,
  });
}

// ── 飛行計時器（背景更新；畫面以氛圍文案取代數字）────────────────────────────

function updateFlightMood() {
  if (!activeFlight) return;
  const dir = DIRECTION_LABEL[activeFlight.routeDirection] || activeFlight.routeDirection;
  const mood = $('fl-mood');
  if (mood) mood.textContent = dir ? `飛行中 · ${dir}` : '飛行中';
  const flDir = $('fl-direction');
  if (flDir) flDir.textContent = dir || '—';

  const mins = minutesSince(activeFlight.takeoffTime);
  $('fl-duration').textContent = fmtDuration(mins);
  $('fl-distance').textContent = Math.round(mins * KM_PER_MINUTE).toLocaleString() + ' km';

  const whisper = $('fl-whisper');
  if (whisper) {
    const idx = Math.min(FLIGHT_WHISPERS.length - 1, Math.floor(mins / 2));
    whisper.textContent = FLIGHT_WHISPERS[idx];
  }
}

function startFlightTicker() {
  stopFlightTicker();
  const tick = () => {
    if (!activeFlight) return;
    updateFlightMood();
    updateGlobeForFlight();
  };
  tick();
  flightTicker = setInterval(tick, 1000);
}
function stopFlightTicker() {
  if (flightTicker) { clearInterval(flightTicker); flightTicker = null; }
}

function preloadImageUrl(url, timeoutMs = 20000) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const img = new Image();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    if (img.complete && img.naturalWidth) finish(true);
    setTimeout(() => finish(false), timeoutMs);
  });
}

const LANDING_SKY_WHISPERS = [
  '晨光正在慢慢亮起…',
  '雲層散開，遠方的地景浮現…',
  '舷窗外的天空，逐漸清楚了…',
];

/** 著陸影片播完後：有生圖則預載；否則短暫過場後用晨景 fallback（本機不卡住） */
async function ensureLandingSceneryReady(landed, maxMs) {
  if (window.WorkshopLocal?.isActive?.()) return false;
  if (landingScenery?.imageUrl && await preloadImageUrl(landingScenery.imageUrl)) return true;

  const waitCap = maxMs ?? (landingScenery?.imageUrl ? 60000 : 22000);
  const deadline = Date.now() + waitCap;
  let wi = 0;
  let lastWhisper = 0;
  await animateFxLine('landing-fx-sub', LANDING_SKY_WHISPERS[0]);
  lastWhisper = Date.now();

  while (Date.now() < deadline) {
    const url = landingScenery?.imageUrl;
    if (url && await preloadImageUrl(url)) return true;
    if (landed?.flightId && !previewMode) {
      try {
        const data = await api('GET', '/api/scenery?flightId=' + encodeURIComponent(landed.flightId));
        if (data.scenery?.imageUrl) {
          landingScenery = {
            ...(landingScenery || {}),
            ...data.scenery,
            arrivalLocation: data.scenery.arrivalLocation || landed.arrivalLocation,
          };
          if (await preloadImageUrl(data.scenery.imageUrl)) return true;
        }
      } catch { /* retry */ }
    }
    if (Date.now() - lastWhisper >= 2400) {
      wi = (wi + 1) % LANDING_SKY_WHISPERS.length;
      animateFxLine('landing-fx-sub', LANDING_SKY_WHISPERS[wi]);
      lastWhisper = Date.now();
    }
    await waitMs(700);
  }
  return !!(landingScenery?.imageUrl);
}

// ── 語音播放（含音波動畫）────────────────────────────────────────────────────

async function playBroadcastWithWave(text, style, {
  maxMs = 0,
  speechBase64,
  restoreBed = true,
} = {}) {
  if (!text || !window.BroadcastAudio) return;
  const wave = $('voice-wave');
  wave?.classList.add('speaking');
  const playPromise = BroadcastAudio.playCaptainBroadcast(text, style || 'formal_captain', {
    speechBase64,
    restoreBed,
  });
  try {
    if (maxMs > 0) {
      await Promise.race([
        playPromise,
        waitMs(maxMs).then(() => { BroadcastAudio?.stopPlayback?.(); }),
      ]);
    } else {
      await playPromise;
    }
  } finally {
    BroadcastAudio?.stopCaptainIntro?.();
    await Promise.race([playPromise.catch(() => {}), waitMs(400)]);
    wave?.classList.remove('speaking');
  }
}

// ── 看板 ─────────────────────────────────────────────────────────────────────

function renderBoard() {
  $('bd-group').textContent = formatTerminalLabel(passenger?.groupId);
  const empty = $('bd-empty'), listEl = $('bd-list');
  if (!groupFlights.length) {
    empty.classList.remove('hidden');
    listEl.innerHTML = '';
    $('bd-broadcasts').classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');

  listEl.innerHTML = groupFlights.map((f, i) => {
    const initial = (f.passengerName || '?').slice(0, 1);
    const flying = f.status === 'in_flight';
    const sub = formatBoardRouteLine(f);
    const tag = flying
      ? '<span class="tag-fly">✈ 飛行中</span>'
      : f.status === 'landed' ? '<span class="tag-land">✓ 抵達</span>' : '';
    return `<div class="brow" role="button" tabindex="0" data-idx="${i}">
      <div class="avatar" style="background:${avatarColor(f.passengerName)}">${initial}</div>
      <div class="brow-info">
        <div class="brow-name">${f.passengerName}</div>
        <div class="brow-sub">${sub}</div>
      </div>${tag}
      <span class="brow-go">›</span>
    </div>`;
  }).join('');

  const bcs = groupFlights.filter((f) => f.takeoffBroadcast || f.captainBroadcast);
  $('bd-broadcasts').classList.toggle('hidden', !bcs.length);
  if (bcs.length) {
    $('bd-broadcasts-list').innerHTML = bcs.map((f) => {
      const parts = [];
      if (f.takeoffBroadcast) parts.push(`<div class="board-bc-meta">${f.passengerName} · 起飛</div><div class="board-bc-text">${f.takeoffBroadcast}</div>`);
      if (f.captainBroadcast) {
        const arrM = arrivalMeta(f);
        parts.push(`<div class="board-bc-meta">${f.passengerName} · 降落 → ${arrM.flag} ${arrM.city} · ${arrM.countryZh}</div><div class="board-bc-text">${f.captainBroadcast}</div>`);
      }
      return `<div class="board-bc-item">${parts.join('')}</div>`;
    }).join('');
  }
  if ($('compass-sheet')?.classList.contains('show')) Compass.refreshFriends();
}

// ── 風景圖顯影 ───────────────────────────────────────────────────────────────

function renderSceneryCard(loading = false) {
  const wrap = $('scenery-wrap');
  const img = $('scenery-img');
  const fallback = $('pw-fallback');
  const hasAI = !!landingScenery?.imageUrl;

  $('scenery-loading').classList.toggle('hidden', !loading);

  // 地點文字（AI 圖有 country；否則用最近降落航班回推）
  const place = landingScenery?.arrivalLocation
    || (lastLandedFlight ? cityOnly(lastLandedFlight.arrivalLocation) : '')
    || '';
  const meta = lastLandedFlight ? arrivalMeta(lastLandedFlight) : null;
  const country = landingScenery?.country
    || meta?.countryZh
    || meta?.country
    || '';
  const flag = meta?.flag || '📍';
  $('scenery-caption').textContent = `${flag} ${place}${country ? ' · ' + country : ''}`.trim();

  if (hasAI) {
    fallback.innerHTML = '';
    fallback.hidden = true;
    img.hidden = false;
    wrap.classList.add('developing');
    img.onload = () => setTimeout(() => wrap.classList.remove('developing'), 80);
    img.src = landingScenery.imageUrl;
    img.alt = landingScenery.arrivalLocation || '降落風景';
    if (img.complete) img.onload();
    $('scenery-link').href = landingScenery.imageUrl;
    $('scenery-link').classList.remove('hidden');
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    $('scenery-link').classList.add('hidden');
    fallback.hidden = false;
    fallback.innerHTML = buildWindowScene(place || 'sky');
  }
}

// ── 小隊看板：點成員 → 地球儀高亮 + 隊友詳情 ─────────────────────────────────

let mateSceneryToken = 0;

function populateMateSheet(f) {
  const depMeta = departureMeta(f);
  const landed = f.status === 'landed';
  const flying = f.status === 'in_flight';
  const meta = landed && f.arrivalLocation ? arrivalMeta(f) : null;

  $('mate-flag').textContent = landed && meta ? meta.flag : (flying ? '🛫' : '🧳');
  $('mate-name').textContent = f.passengerName || '隊友';
  $('mate-status').textContent = landed && meta
    ? `已降落 · ${meta.countryZh}`
    : flying
      ? `飛行中 · 已飛 ${fmtDuration(minutesSince(f.takeoffTime))}`
      : (STATUS_LABEL[f.status] || f.status);

  const more = $('mate-more');
  if (more) more.open = false;

  const arc = $('mate-arc');
  const hasDeparture = !!(f.departureLocation && depMeta.city !== '—');
  if (hasDeparture && (landed || flying)) {
    arc.hidden = false;
    arc.classList.toggle('in-flight', flying);
    fillRouteArc({
      depFlag: 'ma-dep-flag',
      depCity: 'ma-dep-city',
      depCountry: 'ma-dep-country',
      arrFlag: 'ma-arr-flag',
      arrCity: 'ma-arr-city',
      arrCountry: 'ma-arr-country',
    }, depMeta, meta, { inFlight: flying });
    $('mate-route').classList.add('hidden');
  } else {
    arc.hidden = true;
    arc.classList.remove('in-flight');
    $('mate-route').classList.remove('hidden');
    $('mate-route').textContent = flying
      ? `${formatPlaceLine(depMeta)} → … · 已飛 ${fmtDuration(minutesSince(f.takeoffTime))}`
      : formatPlaceLine(depMeta);
  }

  const chips = [];
  if (landed && f.flightDurationMinutes != null) {
    chips.push(`${fmtDuration(f.flightDurationMinutes)}`);
  } else if (flying) {
    chips.push(`已飛 ${fmtDuration(minutesSince(f.takeoffTime))}`);
  }
  if (landed && f.estimatedFlightDistanceKm) {
    chips.push(`${Math.round(f.estimatedFlightDistanceKm).toLocaleString()} km`);
  }
  if (f.routeDirection && DIRECTION_LABEL[f.routeDirection]) {
    chips.push(DIRECTION_LABEL[f.routeDirection]);
  }
  $('mate-meta').innerHTML = chips.map((c) => `<span class="meta-chip">${c}</span>`).join('');

  const bc = f.captainBroadcast || f.takeoffBroadcast;
  $('mate-bc-text').textContent = bc || '這位隊友還沒有機長廣播。';
  const cue = $('mate-cue');
  cue.classList.toggle('hidden', !f.socialCueText);
  cue.textContent = f.socialCueText ? '◎ ' + f.socialCueText : '';

  renderMateScenery(f, meta, landed);
}

async function renderMateScenery(f, meta, landed) {
  const win = $('mate-window');
  if (!landed || !f.arrivalLocation) {
    win.hidden = true;
    return;
  }
  win.hidden = false;

  const scene = $('mate-scene');
  const img = $('mate-img');
  const fallback = $('mate-fallback');
  const token = ++mateSceneryToken;

  $('mate-caption').textContent = (meta.city || cityOnly(f.arrivalLocation)) +
    (meta.countryZh ? ' · ' + meta.countryZh : '');
  img.hidden = true;
  img.removeAttribute('src');
  fallback.innerHTML = '';
  fallback.hidden = true;
  scene.querySelector('.pw-empty')?.remove();
  $('mate-loading').classList.remove('hidden');

  let scenery = null;
  try {
    if (f.flightId) {
      const data = await api('GET', '/api/scenery?flightId=' + encodeURIComponent(f.flightId));
      scenery = data.scenery || null;
    }
  } catch { scenery = null; }
  if (token !== mateSceneryToken) return;

  $('mate-loading').classList.add('hidden');
  if (scenery?.imageUrl) {
    fallback.hidden = true;
    img.hidden = false;
    scene.classList.add('developing');
    img.onload = () => setTimeout(() => scene.classList.remove('developing'), 80);
    img.src = scenery.imageUrl;
    img.alt = f.arrivalLocation || '隊友降落風景';
    if (img.complete) img.onload();
  } else {
    img.hidden = true;
    fallback.hidden = false;
    fallback.innerHTML = buildWindowScene(cityOnly(f.arrivalLocation) || 'sky');
  }
}

/** 地圖點隊友：只顯示運行軌跡，不開詳情面板 */
function showMateTrailsOnGlobe(f) {
  if (!f) return;
  dismissMateSheetOnly();
  applyMateTrailFocus(f);
}

/** 小隊看板點隊友：開精簡詳情，並同步高亮軌跡 */
function openMateFromBoard(f) {
  if (!f) return;
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
  applyMateTrailFocus(f);
  populateMateSheet(f);
  openSheet('mate-sheet');
}

function dismissMateSheetOnly() {
  if (document.body.dataset.openSheet !== 'mate-sheet') return;
  $('sheet-mask')?.classList.remove('show');
  $('mate-sheet')?.classList.remove('show');
  document.body.classList.remove('sheet-open');
  delete document.body.dataset.openSheet;
}

function applyMateTrailFocus(f) {
  const depMeta = departureMeta(f);
  const landed = f.status === 'landed' && !!f.arrivalLocation;
  const flying = f.status === 'in_flight';
  const dep = coordOf(f, 'departureLatitude', 'departureLongitude');
  const arr = landed ? coordOf(f, 'arrivalLatitude', 'arrivalLongitude') : null;
  const idx = groupFlights.indexOf(f);
  const pid = f.passengerId || `name:${f.passengerName}`;

  globeFocusPid = pid;
  archiveGroupTrails(groupFlights);
  const trails = getTrailsForPassenger(f.passengerId, f.passengerName);
  const journeyArcs = trails.map((t) => ({
    from: t.from,
    to: t.to,
    arrLabel: t.arrLabel,
    depLabel: t.depLabel,
    idx,
  }));
  const pos = flying ? flightPlaneCoord(f) : null;
  if (flying && dep && pos) {
    journeyArcs.push({
      from: dep,
      to: pos.c,
      arrLabel: '✈ 飛行中',
      depLabel: cityOnly(f.departureLocation),
      flying: true,
      idx,
    });
  } else if (landed && dep && arr && !journeyArcs.some((a) => a.to && arr
    && Math.abs(a.to[0] - arr[0]) < 0.01 && Math.abs(a.to[1] - arr[1]) < 0.01)) {
    journeyArcs.push({
      from: dep,
      to: arr,
      arrLabel: cityOnly(f.arrivalLocation),
      depLabel: cityOnly(f.departureLocation),
      idx,
    });
  }

  Globe.update({ ...globeTrailPatch() });

  if (journeyArcs.length) {
    const last = journeyArcs[journeyArcs.length - 1];
    Globe.focusMateJourney({
      pid,
      idx,
      from: last.from,
      to: last.to,
      arrLabel: flying ? '✈ 飛行中' : formatPlaceLine(arrivalMeta(f)),
      depLabel: formatPlaceLine(depMeta),
      arcs: journeyArcs,
    });
  } else if (dep) {
    Globe.clearMate();
    globeFocusPid = pid;
    Globe.update({ ...globeTrailPatch() });
    Globe.flyTo(dep, 900);
  }
}

/** @deprecated 請用 showMateTrailsOnGlobe / openMateFromBoard */
function focusGroupMate(f) {
  openMateFromBoard(f);
}

// ── 舷窗影片 ─────────────────────────────────────────────────────────────────

const seamlessLoopHandlers = new WeakMap();

/** 在結尾前提前 seek 回開頭，避免原生 loop 跳回 0 的卡頓 */
function enableSeamlessVideoLoop(video, { leadSec = 0.1, startSec = 0.033 } = {}) {
  disableSeamlessVideoLoop(video);
  const onTimeUpdate = () => {
    const d = video.duration;
    if (!d || !Number.isFinite(d) || d <= leadSec + startSec) return;
    if (video.currentTime >= d - leadSec) {
      try { video.currentTime = startSec; } catch { /* noop */ }
    }
  };
  const onEnded = () => {
    try { video.currentTime = startSec; } catch { /* noop */ }
    video.play().catch(() => { });
  };
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  seamlessLoopHandlers.set(video, { onTimeUpdate, onEnded });
}

function disableSeamlessVideoLoop(video) {
  const handlers = seamlessLoopHandlers.get(video);
  if (!handlers) return;
  video.removeEventListener('timeupdate', handlers.onTimeUpdate);
  video.removeEventListener('ended', handlers.onEnded);
  seamlessLoopHandlers.delete(video);
}

function primeLandingVideoElement(video) {
  if (!video || video.dataset.src === FLIGHT_MEDIA.descent) return;
  video.src = FLIGHT_MEDIA.descent;
  video.dataset.src = FLIGHT_MEDIA.descent;
  video.preload = 'auto';
  video.load();
}

/** 只換源並等到可播放，不開始播 — 讓音效與影片能同一刻起跑 */
async function prepareWindowVideo(video, src) {
  if (!video || !src || video.dataset.src === src) return;
  video.src = src;
  video.dataset.src = src;
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('canplay', done);
      resolve();
    };
    video.addEventListener('loadeddata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
    video.load();
    setTimeout(done, 2800);
  });
}

async function playWindowVideo(video, src, { loop = true } = {}) {
  if (!video || !src) return false;
  const srcChanged = video.dataset.src !== src;
  const sameLooping =
    !srcChanged
    && loop
    && seamlessLoopHandlers.has(video)
    && !video.paused
    && !video.ended
    && video.readyState >= 2;
  if (sameLooping) return true;
  if (!loop) {
    disableSeamlessVideoLoop(video);
    video.pause();
  }
  if (srcChanged) await prepareWindowVideo(video, src);
  if (loop) {
    video.loop = false;
    enableSeamlessVideoLoop(video);
  } else {
    video.loop = false;
    disableSeamlessVideoLoop(video);
  }
  video.muted = true;
  video.playsInline = true;
  video.hidden = false;
  if (srcChanged || !loop) {
    try { video.currentTime = 0; } catch { /* noop */ }
  }
  try {
    await Promise.race([video.play(), waitMs(1200)]);
    return true;
  } catch {
    try {
      await BroadcastAudio?.unlockMedia?.();
      await Promise.race([video.play(), waitMs(1200)]);
      return true;
    } catch {
      return false;
    }
  }
}

function pauseWindowVideo(video) {
  if (!video) return;
  disableSeamlessVideoLoop(video);
  video.pause();
}

function waitForVideoEnd(video, fallbackMs = 4000) {
  return new Promise((resolve) => {
    if (!video) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('ended', finish);
      video.removeEventListener('timeupdate', onTime);
      resolve();
    };
    const onTime = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0 && video.currentTime >= d - 0.15) finish();
    };
    if (video.ended) { finish(); return; }
    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('timeupdate', onTime);
    const d = video.duration;
    const capMs = Number.isFinite(d) && d > 0
      ? Math.max(fallbackMs, d * 1000 + 800)
      : fallbackMs;
    setTimeout(finish, capMs);
  });
}

function glideToArrival(dep, arr, maxMs = LANDING_FX_MS.glideMin) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (arr && Globe.ok) Globe.glideToArrival(dep, arr, finish);
    else finish();
    setTimeout(finish, maxMs);
  });
}

// ── 機窗開合（點飛機 → 展開/收合窗外風景）────────────────────────────────────

function setWindowOpen(open) {
  const btn = $('btn-window');
  const win = $('plane-window');
  if (!btn || !win) return;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.setAttribute('aria-label', open ? '收起舷窗' : '看看窗外風景');
  win.hidden = !open;
  if (open) renderSceneryCard(false);
}
function toggleWindow() {
  setWindowOpen($('btn-window').getAttribute('aria-expanded') !== 'true');
}

function flightWindowCenter() {
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
}

function positionFlightWindow(origin) {
  const win = $('flight-window');
  if (!win) return;
  const pt = (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y))
    ? origin
    : flightWindowCenter();
  win.style.setProperty('--fx-x', `${pt.x}px`);
  win.style.setProperty('--fx-y', `${pt.y}px`);
}

function isFlightWindowVisible() {
  const win = $('flight-window');
  return !!(win && !win.hidden && !win.classList.contains('hidden'));
}

/** 舷窗打開後：takeoff2 一直 loop（無遮帘） */
function ensureFlightWindowVideo() {
  const video = $('flight-window-video');
  if (!video || !isFlightWindowVisible()) return;
  playWindowVideo(video, FLIGHT_MEDIA.descent, { loop: true });
}

function syncFlightWindowAria() {
  const btn = $('btn-flight-window');
  const win = $('flight-window');
  if (!btn || !win) return;
  const open = isFlightWindowVisible();
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.setAttribute('aria-label', open ? '收起舷窗' : '望向窗外');
}

function stopCeremonyAudioForCruise() {
  BroadcastAudio?.stopTowerSignalLoop?.();
  BroadcastAudio?.stopFlightSfx?.({ fade: false });
  BroadcastAudio?.stopPlayback?.();
  BroadcastAudio?.releaseCeremonyMedia?.();
}

function setFlightWindowOpen(open, { origin } = {}) {
  const win = $('flight-window');
  if (!win) return;
  const center = flightWindowCenter();
  if (open) {
    closeSheets();
    positionFlightWindow(center);
    win.hidden = false;
    win.classList.remove('hidden', 'is-closing', 'is-mounted');
    win.classList.add('is-mounting');
    void win.offsetWidth;
    requestAnimationFrame(() => {
      win.classList.remove('is-mounting');
      win.classList.add('is-mounted');
    });
    ensureFlightWindowVideo();
    syncFlightWindowAria();
    return;
  }
  let done = false;
  const hideWindow = () => {
    if (done) return;
    done = true;
    win.hidden = true;
    win.classList.add('hidden');
    win.classList.remove('is-mounting', 'is-mounted', 'is-closing');
    pauseWindowVideo($('flight-window-video'));
    syncFlightWindowAria();
  };
  if (win.hidden) {
    hideWindow();
    return;
  }
  positionFlightWindow(center);
  win.classList.remove('is-mounted');
  win.classList.add('is-closing');
  const onEnd = (e) => {
    if (e.target !== win || e.propertyName !== 'transform') return;
    win.removeEventListener('transitionend', onEnd);
    hideWindow();
  };
  win.addEventListener('transitionend', onEnd);
  setTimeout(hideWindow, 620);
}

function toggleFlightWindow() {
  if (passenger?.status !== 'in_flight') return;
  const win = $('flight-window');
  if (!win || win.hidden) setFlightWindowOpen(true);
  else setFlightWindowOpen(false);
}

function openFlightWindowFromGlobe() {
  toggleFlightWindow();
}

function bindFlightShadeDrag() {
  /* 飛行舷窗已改為無遮帘，保留空函式避免 init 報錯 */
}

function bindFlightWindowDismiss() {
  /* 已移除背景遮罩，點地球儀／dock 光帶 toggle 收起 */
}

// ── 抵達慶祝動畫 ─────────────────────────────────────────────────────────────

let celebratedFlightId = null;
function celebrateArrival(flightId) {
  if (!flightId || celebratedFlightId === flightId) return;
  celebratedFlightId = flightId;
  const burst = $('arrival-burst');
  if (burst) { burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go'); }
  setWindowOpen(true);
  const panel = $('landed-panel');
  if (panel) requestAnimationFrame(() => { panel.scrollTop = 0; });
}

// ── 起飛／降落全螢幕舷窗過場 ─────────────────────────────────────────────────

const TAKEOFF_FX_MS = { enter: 620, leave: 720, crossfade: 780, launchMin: 5200, prepMin: 1800 };
const LANDING_FX_MS = { leave: 720, glideMin: 2800, approachMin: 4200, sceneryHold: 2200 };

function startFxStatusCycle(elId, lines, intervalMs = 2600) {
  if (!lines?.length) return null;
  let i = 0;
  const el = $(elId);
  if (el) el.textContent = lines[0];
  return setInterval(() => {
    i = (i + 1) % lines.length;
    animateFxLine(elId, lines[i]);
  }, intervalMs);
}
function stopFxStatusCycle(timer) {
  if (timer) clearInterval(timer);
}

function preloadTakeoffVideo() {
  const video = $('takeoff-fx-video');
  if (!video) return;
  if (video.dataset.src !== FLIGHT_MEDIA.takeoff) {
    video.src = FLIGHT_MEDIA.takeoff;
    video.dataset.src = FLIGHT_MEDIA.takeoff;
    video.load();
  }
}
async function primeCeremonyMedia({ playTakeoffVideo = true } = {}) {
  await BroadcastAudio?.unlockMedia?.();
  preloadTakeoffVideo();
  preloadLandingVideos();
  primeLandingVideoElement($('landing-fx-video'));
  if (playTakeoffVideo) {
    const takeoffVid = $('takeoff-fx-video');
    if (takeoffVid) playWindowVideo(takeoffVid, FLIGHT_MEDIA.takeoff);
  }
}

function preloadLandingVideos() {
  [FLIGHT_MEDIA.descent, FLIGHT_MEDIA.landing].forEach((src) => {
    if (!src) return;
    const link = document.querySelector(`link[data-preload="${src}"]`);
    if (link) return;
    const el = document.createElement('link');
    el.rel = 'preload';
    el.as = 'video';
    el.href = src;
    el.dataset.preload = src;
    document.head.appendChild(el);
  });
}

function animateFxLine(id, text) {
  const el = $(id);
  if (!el || el.textContent === text) return Promise.resolve();
  return new Promise((resolve) => {
    el.classList.add('is-changing');
    setTimeout(() => {
      el.textContent = text;
      el.classList.remove('is-changing');
      resolve();
    }, 240);
  });
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lockDockForFx(kind) {
  fxDockLock = kind;
  stopAutoRefresh();
}

function unlockDockForFx() {
  fxDockLock = null;
}

/** 等 overlay opacity 退場完成（比固定 ms 更貼近實際動畫） */
function waitFxLeave(el, fallbackMs) {
  if (!el) return waitMs(fallbackMs);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === el && e.propertyName === 'opacity') finish();
    };
    el.addEventListener('transitionend', onEnd);
    setTimeout(finish, fallbackMs);
  });
}

async function revealDockPanel(panelId) {
  updateUI();
  const panel = $(panelId);
  if (!panel || panel.classList.contains('hidden')) return;
  if (panelId === 'landed-panel') {
    landingMusicActive = false;
    void BroadcastAudio?.fadeOutLandingMusic?.({ ms: 3200 });
  }
  panel.classList.remove('dock-panel--enter');
  void panel.offsetWidth;
  panel.classList.add('dock-panel--enter');
  await waitMs(560);
  panel.classList.remove('dock-panel--enter');
}

function setTakeoffFxPhase(phase) {
  const fx = $('takeoff-fx');
  const video = $('takeoff-fx-video');
  if (!fx) return;
  fx.dataset.phase = phase;
  if (phase === 'prep') {
    preloadTakeoffVideo();
    pauseWindowVideo(video);
    animateFxLine('takeoff-fx-title', '塔台連線中…');
    BroadcastAudio?.stopFlightSfx?.({ fade: false });
  } else if (phase === 'launch') {
    preloadTakeoffVideo();
    animateFxLine('takeoff-fx-title', '起飛中…');
    playWindowVideo(video, FLIGHT_MEDIA.takeoff, { loop: false });
    BroadcastAudio?.playFlightSfx?.(FLIGHT_SFX.takeoff, { loop: true, volume: 0.65, fadeInMs: 800 });
  }
}

/** 起飛影片播完（至少 launchMin）再結束過場，避免過早露出地圖 */
async function waitTakeoffLaunchComplete() {
  const video = $('takeoff-fx-video');
  if (!video) {
    await waitMs(TAKEOFF_FX_MS.launchMin);
    return;
  }
  await waitForVideoEnd(video, TAKEOFF_FX_MS.launchMin);
  await BroadcastAudio?.stopFlightSfx?.({ fade: true, ms: 550 });
}
function showTakeoffFx(sub, { phase = 'prep' } = {}) {
  const fx = $('takeoff-fx');
  if (!fx) return;
  if (sub) animateFxLine('takeoff-fx-sub', sub);
  fx.classList.remove('is-leaving');
  preloadTakeoffVideo();
  requestAnimationFrame(() => fx.classList.add('show'));
  setTakeoffFxPhase(phase);
}
async function hideTakeoffFx({ fast = false } = {}) {
  const fx = $('takeoff-fx');
  if (!fx?.classList.contains('show')) {
    pauseWindowVideo($('takeoff-fx-video'));
    BroadcastAudio?.stopFlightSfx?.({ fade: false });
    BroadcastAudio?.stopTowerSignalLoop?.();
    setTakeoffFxPhase('prep');
    fx?.classList.remove('is-leaving');
    return;
  }
  if (fast) {
    fx.classList.remove('show', 'is-leaving');
    pauseWindowVideo($('takeoff-fx-video'));
    BroadcastAudio?.stopFlightSfx?.({ fade: false });
    BroadcastAudio?.stopTowerSignalLoop?.();
    setTakeoffFxPhase('prep');
    return;
  }
  fx.classList.add('is-leaving');
  fx.classList.remove('show');
  BroadcastAudio?.stopTowerSignalLoop?.();
  BroadcastAudio?.stopFlightSfx?.({ fade: true, ms: 650 });
  await waitFxLeave(fx, TAKEOFF_FX_MS.leave + 100);
  pauseWindowVideo($('takeoff-fx-video'));
  fx.classList.remove('is-leaving');
  setTakeoffFxPhase('prep');
}

// ── 降落過場 ─────────────────────────────────────────────────────────────────

function showLandingFx(sub, { phase = 'descent' } = {}) {
  const fx = $('landing-fx');
  if (!fx) return;
  fx.classList.remove('fx-dismissible');
  resetLandingFxScenery();
  if (sub) animateFxLine('landing-fx-sub', sub);
  fx.classList.remove('is-leaving');
  requestAnimationFrame(() => {
    fx.classList.add('show');
    preloadLandingVideos();
    setLandingFxPhase(phase);
  });
}

/** 抵達風景顯影後：點擊背景或「查看抵達」關閉過場（iPhone 需明確按鈕） */
function waitLandingFxDismiss() {
  return new Promise((resolve) => {
    const fx = $('landing-fx');
    const card = fx?.querySelector('.fx-overlay-card');
    if (!fx?.classList.contains('show')) { resolve(); return; }

    let done = false;
    let dismissBtn = null;
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    const onOverlayTap = (e) => {
      if (dismissBtn?.contains(e.target)) return;
      if (card?.contains(e.target)) return;
      finish();
    };
    const finish = () => {
      if (done) return;
      done = true;
      fx.classList.remove('fx-dismissible');
      fx.removeEventListener('click', onOverlayTap);
      fx.removeEventListener('touchend', onOverlayTap);
      document.removeEventListener('keydown', onKey);
      dismissBtn?.remove();
      clearTimeout(safety);
      resolve();
    };

    (async () => {
      await waitMs(1200);
      if (done) return;
      animateFxLine('landing-fx-sub', '點一下繼續');
      fx.classList.add('fx-dismissible');
      dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'fx-dismiss-btn';
      dismissBtn.textContent = '查看抵達';
      dismissBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
      card?.appendChild(dismissBtn);
      fx.addEventListener('click', onOverlayTap);
      fx.addEventListener('touchend', onOverlayTap, { passive: true });
      document.addEventListener('keydown', onKey);
    })();

    const safetyMs = window.matchMedia('(pointer: coarse)').matches ? 22000 : 45000;
    const safety = setTimeout(finish, safetyMs);
  });
}
function resetLandingFxScenery() {
  const video = $('landing-fx-video');
  const img = $('landing-fx-scenery');
  const fallback = $('landing-fx-fallback');
  const scene = $('landing-fx-scene');
  if (video) video.hidden = false;
  if (img) { img.hidden = true; img.removeAttribute('src'); }
  if (fallback) { fallback.hidden = true; fallback.innerHTML = ''; }
  scene?.classList.remove('developing');
}

/** landing.mp4 結束後：舷窗由影片切換為抵達風景（AI 圖或晨景 SVG） */
async function showLandingFxScenery(landed) {
  const fx = $('landing-fx');
  const scene = $('landing-fx-scene');
  const video = $('landing-fx-video');
  const img = $('landing-fx-scenery');
  const fallback = $('landing-fx-fallback');
  if (!landed || !scene || !video) return;

  pauseWindowVideo(video);
  const meta = arrivalMeta(landed);
  const place = meta.city || cityOnly(landed.arrivalLocation) || '';
  const hasAI = !!landingScenery?.imageUrl;

  if (hasAI && img) {
    if (fallback) fallback.hidden = true;
    // 先不帶過渡直接套上模糊，圖載好後再開啟過渡移除 → 保證每次都有「顯影」模糊轉清楚
    img.style.transition = 'none';
    scene.classList.add('developing');
    img.hidden = false;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      img.onload = finish;
      img.onerror = finish;
      img.src = landingScenery.imageUrl;
      img.alt = landed.arrivalLocation || '降落風景';
      if (img.complete) finish();
      setTimeout(finish, 3500);
    });
    void img.offsetWidth;
    img.style.transition = '';
    await waitMs(120);
    scene.classList.remove('developing');
  } else if (fallback) {
    if (img) img.hidden = true;
    fallback.hidden = false;
    fallback.innerHTML = buildWindowScene(place || 'sky');
  }

  if (fx) fx.dataset.phase = 'arrival';
  await waitMs(900);
  pauseWindowVideo(video);
  video.hidden = true;
  const flag = meta.flag || '🌍';
  const country = meta.countryZh || meta.country || '';
  animateFxLine('landing-fx-title', `${flag} ${place || '已抵達'}`);
  animateFxLine(
    'landing-fx-sub',
    country ? `歡迎抵達 · ${country}` : '歡迎抵達',
  );
}

function setLandingFxPhase(phase) {
  const fx = $('landing-fx');
  const video = $('landing-fx-video');
  if (!fx || !video) return;
  fx.dataset.phase = phase;
  if (phase === 'descent') {
    animateFxLine('landing-fx-title', '開始下降…');
    playWindowVideo(video, FLIGHT_MEDIA.descent, { loop: true });
  }
}

/** 機長廣播結束 → 著陸段：清 TTS、解鎖媒體、停下降 loop，再接 landing.mp4 */
async function bridgeAfterCaptainBroadcast() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  BroadcastAudio?.stopCaptainIntro?.();
  BroadcastAudio?.stopPlayback?.();
  await BroadcastAudio?.unlockMedia?.();
  await BroadcastAudio?.startMediaKeepAlive?.();
  // wakeup 在 TTS 前會漸弱至無聲；landing.mp4 時由 duckCeremonyBed 以小聲底床回來
  const video = $('landing-fx-video');
  if (video) {
    disableSeamlessVideoLoop(video);
    pauseWindowVideo(video);
    video.hidden = false;
  }
}

/** 對準跑道：landing.mp4 一次 + takeoff.mp3 同步 */
async function playLandingApproach() {
  const video = $('landing-fx-video');
  const fx = $('landing-fx');
  if (!video) return;
  await BroadcastAudio?.unlockMedia?.();
  if (fx) fx.dataset.phase = 'approach';
  animateFxLine('landing-fx-title', '即將抵達…');
  animateFxLine('landing-fx-sub', '對準跑道 · 即將著陸…');
  // 先把 landing.mp4 載到可播、音景壓低，音效與影片才會同一刻開始
  await Promise.all([
    prepareWindowVideo(video, FLIGHT_MEDIA.landing),
    BroadcastAudio?.duckCeremonyBed?.(),
  ]);
  await Promise.all([
    BroadcastAudio?.playFlightSfx?.(FLIGHT_SFX.takeoff, { loop: true, volume: 0.65, fadeInMs: 900 }),
    playWindowVideo(video, FLIGHT_MEDIA.landing, { loop: false }),
  ]);
  await waitForVideoEnd(video, LANDING_FX_MS.approachMin);
  await BroadcastAudio?.crossfadeApproachSfxToWakeup?.();
}
async function hideLandingFx({ fast = false } = {}) {
  const fx = $('landing-fx');
  if (!fx) return;
  fx.classList.remove('fx-dismissible');
  if (fast || !fx.classList.contains('show')) {
    fx.classList.remove('show', 'is-leaving');
    pauseWindowVideo($('landing-fx-video'));
    resetLandingFxScenery();
    return;
  }
  fx.classList.add('is-leaving');
  fx.classList.remove('show');
  pauseWindowVideo($('landing-fx-video'));
  await waitFxLeave(fx, LANDING_FX_MS.leave + 100);
  fx.classList.remove('is-leaving');
  resetLandingFxScenery();
}

async function requestLandingScenery(flightId) {
  if (!flightId || previewMode || window.WorkshopLocal?.isActive()) return false;
  try {
    const data = await api('POST', '/api/scenery/backfill', { flightIds: [flightId] }, { timeoutMs: 110000 });
    const row = data.results?.[0];
    if (row?.error) console.warn('[landing scenery]', row.error);
    if (!row?.imageUrl || lastLandedFlight?.flightId !== flightId) return false;
    landingScenery = {
      imageUrl: row.imageUrl,
      arrivalLocation: row.arrivalLocation || lastLandedFlight.arrivalLocation,
      country: arrivalMeta(lastLandedFlight).country,
    };
    renderSceneryCard(false);
    // 若降落過場還開著（已顯示晨景 fallback），圖到了就即時換上真圖
    const fx = $('landing-fx');
    if (fx?.classList.contains('show') && fx.dataset.phase === 'arrival') {
      void showLandingFxScenery(lastLandedFlight);
    }
    return true;
  } catch (err) {
    console.warn('[landing scenery]', err);
    return false;
  }
}

// ── 主 UI 狀態機 ─────────────────────────────────────────────────────────────

function recoverFxDockState() {
  if (!fxDockLock) return;
  const fxVisible = !!$('takeoff-fx')?.classList.contains('show')
    || !!$('landing-fx')?.classList.contains('show');
  if (!fxVisible) fxDockLock = null;
}

function updateUI() {
  const loggedIn = !!passenger;
  $('login-section').classList.toggle('hidden', loggedIn);
  $('main-section').classList.toggle('hidden', !loggedIn);
  $('hdr-preview-hint')?.classList.toggle('hidden', !previewMode);
  if (!passenger) {
    closeSheets();
    delete document.body.dataset.uiPhase;
    Globe.setIdle(true);
    return;
  }

  recoverFxDockState();

  const isFlying = passenger.status === 'in_flight';
  const dismissed = !!$('landed-panel').dataset.dismissed;
  let showLanded = !isFlying && !!lastLandedFlight && !dismissed;
  if (isFlying || showLanded) closeSheets();

  $('hdr-name').textContent = passenger.name || '乘客';
  $('hdr-badge').textContent = STATUS_LABEL[passenger.status] || passenger.status;

  let showReady;
  let showFlight;
  if (fxDockLock === 'takeoff') {
    showReady = true;
    showFlight = false;
    showLanded = false;
  } else if (fxDockLock === 'landing') {
    showReady = false;
    showFlight = true;
    showLanded = false;
  } else {
    showLanded = !isFlying && !!lastLandedFlight && !dismissed;
    showReady = !isFlying && !showLanded;
    showFlight = isFlying;
  }
  $('ready-panel').classList.toggle('hidden', !showReady);
  $('btn-compass')?.classList.toggle('hidden', !showReady || !takeoffArmed);
  $('flight-panel').classList.toggle('hidden', !showFlight);
  $('landed-panel').classList.toggle('hidden', !showLanded);
  if (!showFlight) resetLandPrep();
  else syncLandButton();

  document.body.dataset.uiPhase = isFlying ? 'flying' : showLanded ? 'landed' : 'ready';

  if (isFlying && activeFlight && !fxDockLock) {
    updateFlightMood();
    Globe.setIdle(false);
    startFlightTicker();
  } else {
    stopFlightTicker();
    setFlightWindowOpen(false);
    Globe.setIdle(!showLanded);
  }

  if (showReady) {
    const depMeta = locationMeta(passenger.currentLocation);
    $('tk-departure').textContent = `${depMeta.flag} ${depMeta.city} · ${depMeta.countryZh}`;
    updateGlobeForReady();
    syncTakeoffButton();
  }

  if (showLanded) {
    const meta = arrivalMeta(lastLandedFlight);
    const depMeta = departureMeta(lastLandedFlight);
    const dur = fmtDuration(lastLandedFlight.flightDurationMinutes);
    const dist = lastLandedFlight.estimatedFlightDistanceKm
      ? Math.round(lastLandedFlight.estimatedFlightDistanceKm).toLocaleString() + ' km' : '—';
    $('bc-flag').textContent = meta.flag;
    $('bc-route').textContent = meta.city || '未知目的地';
    $('bc-country').textContent = meta.countryZh;
    fillRouteArc({
      depFlag: 'bc-dep-flag',
      depCity: 'bc-dep-city',
      depCountry: 'bc-dep-country',
      arrFlag: 'bc-arr-flag',
      arrCity: 'bc-arr-city',
      arrCountry: 'bc-arr-country',
    }, depMeta, meta);
    $('bc-stamp').textContent = '已抵達';
    $('bc-origin').textContent = `${dur} · ${dist}`;
    $('bc-duration').textContent = dur;
    $('bc-distance').textContent = dist;
    const broadcastEl = $('bc-broadcast');
    const fold = $('bc-broadcast-fold');
    if (broadcastEl) {
      broadcastEl.textContent = lastLandedFlight.captainBroadcast || '尚無機長廣播。';
    }
    if (fold) fold.open = false;
    renderSceneryCard(false);
    celebrateArrival(lastLandedFlight.flightId || lastLandedFlight.notionId || 'landed');
    if (landingMusicActive) syncLandingMusicLabel(true);
  }

  renderBoard();
  syncTrailControls();
}

function dismissLandedPanel() {
  stopLandingMusic({ fade: false });
  resetTakeoffPrep();
  $('landed-panel').dataset.dismissed = '1';
  if (passenger?.status === 'landed') passenger.status = 'not_started';
  updateUI();
}

// ── Terminal 航站（四位數 groupId）────────────────────────────────────────────

function normalizeTerminalDigits(raw) {
  const digits = rawTerminalDigits(raw);
  if (!digits) return '';
  return digits.slice(-4).padStart(4, '0');
}

function rawTerminalDigits(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 4);
}

function groupIdToTerminalDigits(groupId) {
  if (!groupId) return '';
  const legacy = /^group_(\d{2})$/i.exec(String(groupId));
  if (legacy) return legacy[1].padStart(4, '0');
  return normalizeTerminalDigits(groupId);
}

function readTerminalGroupId() {
  const digits = normalizeTerminalDigits($('input-group')?.value);
  return /^\d{4}$/.test(digits) ? digits : '';
}

function formatTerminalLabel(groupId) {
  const digits = groupIdToTerminalDigits(groupId);
  return digits ? `T-${digits}` : '—';
}

function legacyGroupIdForTerminal(groupId) {
  const digits = groupIdToTerminalDigits(groupId);
  if (!/^\d{4}$/.test(digits)) return '';
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 1 || n > 15) return '';
  return `group_${String(n).padStart(2, '0')}`;
}

function terminalGroupIdForLegacy(groupId) {
  const legacy = /^group_(\d{2})$/i.exec(String(groupId || ''));
  if (!legacy) return '';
  const n = Number(legacy[1]);
  if (!Number.isInteger(n) || n < 1 || n > 15) return '';
  return String(n).padStart(4, '0');
}

function compatibleGroupIds(groupId) {
  const ids = new Set();
  const digits = groupIdToTerminalDigits(groupId);
  if (/^\d{4}$/.test(digits)) ids.add(digits);
  if (groupId) ids.add(String(groupId));
  const legacy = legacyGroupIdForTerminal(groupId);
  if (legacy) ids.add(legacy);
  const terminal = terminalGroupIdForLegacy(groupId);
  if (terminal) ids.add(terminal);
  return [...ids].filter(Boolean);
}

function buildTerminalShareUrl(digits) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('terminal', digits);
  url.searchParams.set('login', '1');
  return url.toString();
}

function applyTerminalFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('terminal') || params.get('t');
  if (!raw) return false;
  const digits = normalizeTerminalDigits(raw);
  if (!/^\d{4}$/.test(digits)) return false;
  if ($('input-group')) $('input-group').value = digits;
  return true;
}

function bindTerminalInput() {
  const input = $('input-group');
  if (!input) return;
  input.addEventListener('input', () => {
    input.value = rawTerminalDigits(input.value);
  });
  input.addEventListener('blur', () => {
    const digits = normalizeTerminalDigits(input.value);
    if (digits) input.value = digits;
  });
}

function createRandomTerminal() {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const input = $('input-group');
  if (input) {
    input.value = digits;
    input.focus();
  }
  clearMsg('login');
  showMsg('login', 'success', `已建立 Terminal T-${digits} · 按分享邀請隊友加入`);
}

async function shareTerminalLink(source = 'login') {
  const digits = readTerminalGroupId() || groupIdToTerminalDigits(passenger?.groupId);
  if (!/^\d{4}$/.test(digits)) {
    const msg = source === 'board'
      ? '無法分享：請先登入並確認 Terminal 代碼。'
      : '請先輸入或建立四位數 Terminal。';
    showMsg(source === 'board' ? 'main' : 'login', 'error', msg);
    return;
  }
  const url = buildTerminalShareUrl(digits);
  const title = `甦醒航班 Terminal T-${digits}`;
  const text = `加入我的航站 Terminal T-${digits}，一起飛！`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      if (source === 'login') showMsg('login', 'success', '航站連結已分享');
      else showMsg('main', 'success', '航站連結已分享');
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    const okMsg = '航站連結已複製 · 隊友開啟後會自動帶入 Terminal';
    if (source === 'login') showMsg('login', 'success', okMsg);
    else showMsg('main', 'success', okMsg);
  } catch {
    const failMsg = `無法複製連結，請手動分享：${url}`;
    if (source === 'login') showMsg('login', 'error', failMsg);
    else showMsg('main', 'error', failMsg);
  }
}

// ── 契約 API 動作（doLogin / doTakeoff / doLand / fetchBoard / refreshProgress）──

async function doLogin(e) {
  e.preventDefault();
  clearMsg('login');
  const passengerId = $('input-pid').value.trim();
  const name = $('input-name').value.trim();
  const groupId = readTerminalGroupId();
  if (!passengerId || !name || !groupId) {
    showMsg('login', 'error', groupId ? '請填寫所有欄位。' : 'Terminal 須為四位數字（0000–9999）。');
    return;
  }

  primeMediaOnUserGesture();
  setLoginLoading(true);
  try {
    const data = await api('POST', '/api/passenger', { passengerId, name, groupId });
    previewMode = false;
    passenger = data.passenger;
    lastLandedFlight = data.lastLandedFlight || null;
    landingScenery = data.landingScenery || null;
    resetTakeoffPrep();
    delete $('landed-panel').dataset.dismissed;
    saveLoginProfile({ passengerId, name, groupId });
    if (lastLandedFlight) {
      archiveFlightTrail(lastLandedFlight);
    }

    // 先進入主畫面；看板與風景並行背景載入（風景不再等看板）
    updateUI();
    Globe.flyTo(youCoord(), 1200);
    startAutoRefresh();
    setLoginLoading(false);

    void ensureCities().then(() => {
      if (passenger?.status === 'in_flight') updateGlobeForFlight();
      else if (passenger) updateGlobeForReady();
    });

    const sceneryPromise = lastLandedFlight?.flightId && !landingScenery?.imageUrl
      ? ensureLandingSceneryForFlight(lastLandedFlight.flightId, { allowBackfill: true })
      : Promise.resolve(false);
    const boardPromise = (async () => {
      try {
        if (passenger.status === 'in_flight') await refreshProgress();
        await fetchBoard();
      } catch { /* silent */ }
    })();
    void Promise.all([sceneryPromise, boardPromise]);
  } catch (err) {
    showMsg('login', 'error', err.message);
    setLoginLoading(false);
  }
}

function setLoginLoading(on) {
  const btn = $('btn-login');
  const label = $('btn-login-label');
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
  if (label) label.textContent = on ? '登入中…' : '登入';
}

async function loadLandingSceneryForFlight(flightId) {
  if (!flightId || previewMode) return false;
  try {
    const data = await api('GET', '/api/scenery?flightId=' + encodeURIComponent(flightId));
    if (data.scenery?.imageUrl && lastLandedFlight?.flightId === flightId) {
      landingScenery = data.scenery;
      if (!$('landed-panel')?.classList.contains('hidden')) renderSceneryCard(false);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 登入／抵達面板：先讀既有圖；沒有就背景補生（Able 這類漏圖會在下次登入自動補） */
async function ensureLandingSceneryForFlight(flightId, { allowBackfill = false } = {}) {
  if (!flightId || previewMode || window.WorkshopLocal?.isActive?.()) return false;
  if (landingScenery?.imageUrl) {
    if (!$('landed-panel')?.classList.contains('hidden')) renderSceneryCard(false);
    return true;
  }

  if (!$('landed-panel')?.classList.contains('hidden')) renderSceneryCard(true);
  const ok = await loadLandingSceneryForFlight(flightId);
  if (ok) return true;
  if (!allowBackfill) {
    if (!$('landed-panel')?.classList.contains('hidden')) renderSceneryCard(false);
    return false;
  }

  // 缺圖：觸發一次 backfill（例如降落時 Vercel 逾時沒存到）
  const generated = await requestLandingScenery(flightId);
  if (!generated && !$('landed-panel')?.classList.contains('hidden')) {
    renderSceneryCard(false);
  }
  return generated;
}

async function doTakeoff() {
  if (previewMode) {
    showMsg('main', 'error', '目前為 UI 示範。請先登出，登入後再測試起飛。');
    return;
  }
  clearMsg('main');
  stopLandingMusic();
  closeSheets();
  primeMediaOnUserGesture();
  const btn = $('btn-takeoff');
  btn.disabled = true;
  let statusCycle = null;
  try {
    await ensureMediaUnlocked();
    lockDockForFx('takeoff');
    showTakeoffFx('塔台連線中 · 請稍候…', { phase: 'prep' });
    BroadcastAudio?.startTowerSignalLoop?.();
    statusCycle = startFxStatusCycle('takeoff-fx-sub', [
      '塔台連線中 · 請稍候…',
      '同步航線與小隊雷達…',
      '機長整理起飛廣播…',
    ]);
    const mediaPrime = primeCeremonyMedia({ playTakeoffVideo: false });
    const data = await Promise.all([
      api('POST', '/api/flight/takeoff', {
        passengerId: passenger.passengerId,
        name: passenger.name,
        groupId: passenger.groupId,
        routeDirection: $('tk-direction').value,
      }, { timeoutMs: 52000 }),
      waitMs(TAKEOFF_FX_MS.prepMin),
      mediaPrime,
    ]).then(([result]) => result);
    stopFxStatusCycle(statusCycle);
    statusCycle = null;
    BroadcastAudio?.stopTowerSignalLoop?.();

    activeFlight = data.flight;
    passenger.status = 'in_flight';
    takeoffArmed = false;
    lastLandedFlight = null;
    landingScenery = null;
    delete $('landed-panel').dataset.dismissed;

    if (activeFlight.takeoffBroadcast) {
      await ensureMediaUnlocked();
      await animateFxLine('takeoff-fx-sub', '機長廣播中…');
      await playBroadcastWithWave(
        activeFlight.takeoffBroadcast,
        activeFlight.takeoffBroadcastStyle,
        { maxMs: 180000, speechBase64: data.speechAudioBase64 },
      );
    }

    await animateFxLine('takeoff-fx-sub', '推進器啟動 · 準備離地…');
    setTakeoffFxPhase('launch');
    await waitTakeoffLaunchComplete();

    await hideTakeoffFx();
    await ensureCities();
    Globe.flyTo(youCoord(), 1600);
    stopCeremonyAudioForCruise();
    unlockDockForFx();
    await revealDockPanel('flight-panel');
    updateGlobeForFlight();

    await fetchBoard();
    startAutoRefresh();
  } catch (err) {
    if (statusCycle) stopFxStatusCycle(statusCycle);
    BroadcastAudio?.stopTowerSignalLoop?.();
    unlockDockForFx();
    await hideTakeoffFx({ fast: true });
    BroadcastAudio?.stopFlightSfx?.({ fade: false });
    try {
      await refreshProgress();
      if (activeFlight && passenger?.status === 'in_flight') {
        showMsg('main', 'error', '連線逾時，但航班似乎已建立。已恢復飛行畫面。');
        updateUI();
        startAutoRefresh();
        return;
      }
    } catch { /* noop */ }
    showMsg('main', 'error', err.message);
  } finally {
    btn.disabled = false;
    stopCeremonyAudioForCruise();
  }
}

async function doLand() {
  if (previewMode) {
    showMsg('main', 'error', '目前為 UI 示範。請先登出，登入後再測試降落。');
    return;
  }
  clearMsg('main');
  primeMediaOnUserGesture();
  const btn = $('btn-land');
  btn.disabled = true;
  let statusCycle = null;
  try {
    await ensureMediaUnlocked();
    renderSceneryCard(true);
    lockDockForFx('landing');
    showLandingFx('穿越雲層中…', { phase: 'descent' });
    statusCycle = startFxStatusCycle('landing-fx-sub', [
      '穿越雲層中…',
      '高度下降 · 窗外雲海翻湧…',
      '甦醒航班正在接近目的地…',
    ]);
    const mediaPrime = primeCeremonyMedia({ playTakeoffVideo: false });
    await Promise.all([startLandingMusic(), mediaPrime]);

    const landPromise = api('POST', '/api/flight/land', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
    }, { timeoutMs: 52000 });

    const data = await landPromise;
    stopFxStatusCycle(statusCycle);
    statusCycle = null;

    const landed = data.flight;
    lastLandedFlight = landed;
    landingScenery = data.landingScenery || null;
    const sceneryPreload = landingScenery?.imageUrl
      ? preloadImageUrl(landingScenery.imageUrl)
      : null;
    passenger.status = 'landed';
    passenger.currentLocation = landed.arrivalLocation || passenger.currentLocation;
    if (typeof landed.arrivalLatitude === 'number') {
      passenger.currentLatitude = landed.arrivalLatitude;
      passenger.currentLongitude = landed.arrivalLongitude;
    }
    archiveFlightTrail(landed);
    stopFlightTicker();
    delete $('landed-panel').dataset.dismissed;
    activeFlight = null;

    // 語音檔已隨 landing API 回來；從這一刻開始生圖，讓 captain intro、TTS、landing 影片都成為生圖時間。
    const sceneryStartedAt = Date.now();
    const sceneryMaxMs = 68000;
    const sceneryJob = landed.flightId && !landingScenery?.imageUrl
      ? requestLandingScenery(landed.flightId)
      : Promise.resolve(!!landingScenery?.imageUrl);

    // ② 機長廣播（captain.mp3 起播時 wakeup 漸弱至無聲，再接 TTS）
    await ensureMediaUnlocked();
    await animateFxLine('landing-fx-sub', '機長廣播中…');
    if (landed.captainBroadcast) {
      await playBroadcastWithWave(
        landed.captainBroadcast,
        landed.captainBroadcastStyle || landed.takeoffBroadcastStyle,
        { maxMs: 180000, speechBase64: data.speechAudioBase64, restoreBed: false },
      );
    }

    // ③ 機長播完 → landing.mp4 + takeoff.mp3（wakeup 以小聲底床回來），地球儀滑向抵達地
    await bridgeAfterCaptainBroadcast();
    const dep = coordOf(landed, 'departureLatitude', 'departureLongitude') || DEFAULT_COORD;
    const arr = coordOf(landed, 'arrivalLatitude', 'arrivalLongitude');
    await Promise.all([
      playLandingApproach(),
      arr ? glideToArrival(dep, arr) : Promise.resolve(),
    ]);

    // ④ landing 播完後等剩餘生圖預算（最多再 18 秒，不讓過場卡住；圖晚到會即時換上）
    await animateFxLine('landing-fx-sub', LANDING_SKY_WHISPERS[0]);
    if (sceneryPreload) await sceneryPreload;
    else {
      const remainingSceneryMs = Math.min(
        18000,
        Math.max(0, sceneryMaxMs - (Date.now() - sceneryStartedAt)),
      );
      await Promise.race([
        sceneryJob.catch(() => false),
        ensureLandingSceneryReady(landed, remainingSceneryMs),
      ]);
    }
    await showLandingFxScenery(landed);
    await waitLandingFxDismiss();

    // ⑤ 顯示抵達面板（wakeup 漸弱）
    if (arr) Globe.update({ you: { c: arr, label: `你 · ${cityOnly(landed.arrivalLocation)}` }, arrival: null });
    await hideLandingFx();
    unlockDockForFx();
    await revealDockPanel('landed-panel');

    await fetchBoard();
    // 第一次生圖失敗（逾時／API 錯誤）→ 背景再試一次，好了會更新抵達面板的風景卡
    void sceneryJob.then((ok) => {
      if (!ok && landed.flightId && !landingScenery?.imageUrl && lastLandedFlight?.flightId === landed.flightId) {
        return requestLandingScenery(landed.flightId);
      }
      return ok;
    });
  } catch (err) {
    if (statusCycle) stopFxStatusCycle(statusCycle);
    unlockDockForFx();
    hideLandingFx({ fast: true });
    stopLandingMusic();
    BroadcastAudio?.stopFlightSfx?.({ fade: false });
    renderSceneryCard(false);
    if (await tryRecoverLandedState()) {
      showMsg('main', 'error', '此航班已在伺服器完成降落，已恢復抵達畫面。');
      return;
    }
    landingScenery = null;
    showMsg('main', 'error', err.message);
  } finally {
    btn.disabled = false;
    BroadcastAudio?.releaseCeremonyMedia?.();
  }
}

async function fetchBoard() {
  if (!passenger) return;
  try {
    const groupIds = compatibleGroupIds(passenger.groupId);
    const results = await Promise.allSettled(groupIds.map((groupId) => (
      api('GET', '/api/board?groupId=' + encodeURIComponent(groupId))
    )));
    const seen = new Set();
    const flights = [];
    for (const result of results) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value.flights)) continue;
      for (const flight of result.value.flights) {
        const key = flight.flightId || flight.notionId || [
          flight.passengerId,
          flight.takeoffTime,
          flight.groupId,
        ].filter(Boolean).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        flights.push(sanitizeBoardFlight(flight));
      }
    }
    if (flights.length || results.some((r) => r.status === 'fulfilled')) {
      groupFlights = flights.sort((a, b) => {
        const at = new Date(a.landingTime || a.takeoffTime || 0).getTime();
        const bt = new Date(b.landingTime || b.takeoffTime || 0).getTime();
        return bt - at;
      });
      archiveGroupTrails(groupFlights);
    }
    renderBoard();
    if (passenger.status === 'in_flight') updateGlobeForFlight();
    else updateGlobeForReady();
  } catch { /* silent */ }
}

async function refreshProgress() {
  if (!passenger) return;
  try {
    const data = await api('GET', '/api/flight/progress?passengerId=' + encodeURIComponent(passenger.passengerId));
    activeFlight = data.activeFlight || null;
    if (!activeFlight && passenger.status === 'in_flight') passenger.status = 'landed';
    if (activeFlight) passenger.status = 'in_flight';
    if (!fxDockLock) updateUI();
  } catch { /* silent */ }
}

/** 降落 API 失敗／逾時時，若伺服器已寫入 landed，恢復抵達面板 */
async function tryRecoverLandedState() {
  if (!passenger || previewMode) return false;
  try {
    await refreshProgress();
    if (activeFlight) return false;
    const data = await api('POST', '/api/passenger', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
    });
    const landed = data.lastLandedFlight;
    if (!landed || landed.status !== 'landed') return false;

    passenger = data.passenger;
    lastLandedFlight = landed;
    landingScenery = data.landingScenery || null;
    activeFlight = null;
    stopFlightTicker();
    delete $('landed-panel').dataset.dismissed;
    if (landed.arrivalLocation) passenger.currentLocation = landed.arrivalLocation;
    if (typeof landed.arrivalLatitude === 'number') {
      passenger.currentLatitude = landed.arrivalLatitude;
      passenger.currentLongitude = landed.arrivalLongitude;
    }
    archiveFlightTrail(landed);
    await fetchBoard();
    const arr = coordOf(landed, 'arrivalLatitude', 'arrivalLongitude');
    if (arr) Globe.update({ you: { c: arr, label: `你 · ${cityOnly(landed.arrivalLocation)}` }, arrival: null });
    Globe.flyTo(youCoord(), 1200);
    updateUI();
    return true;
  } catch {
    return false;
  }
}

// ── 登入資料記憶 ─────────────────────────────────────────────────────────────

const LOGIN_STORAGE_KEY = 'sleepAirline_lastLogin';
function saveLoginProfile(p) {
  try { localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(p)); } catch { /* noop */ }
}
function loadLoginProfile() {
  try {
    const d = JSON.parse(localStorage.getItem(LOGIN_STORAGE_KEY) || 'null');
    return d?.passengerId && d?.name && d?.groupId ? d : null;
  } catch { return null; }
}
function fillLoginForm(p) {
  if (!p) return;
  $('input-pid').value = p.passengerId;
  $('input-name').value = p.name;
  const digits = groupIdToTerminalDigits(p.groupId);
  if (digits) $('input-group').value = digits;
}

// ── UI 示範（不需登入、不需後端）────────────────────────────────────────────

function enterDemoPreview() {
  previewMode = true;
  stopAutoRefresh();
  stopFlightTicker();

  passenger = {
    passengerId: 'demo_preview', name: '示範乘客', groupId: '0428',
    status: 'not_started', currentLocation: 'Taipei, Taiwan',
    currentLatitude: 25.033, currentLongitude: 121.5654,
  };
  activeFlight = null;
  lastLandedFlight = null;
  landingScenery = null;
  groupFlights = [
    {
      passengerName: 'Amy', status: 'in_flight', routeDirection: 'eastbound',
      departureLocation: 'London, UK', departureLatitude: 51.5, departureLongitude: -0.12,
      takeoffTime: new Date(Date.now() - 190 * 60000).toISOString(),
      takeoffBroadcast: '夜航開始，請調暗舷窗。',
    },
    {
      passengerName: '阿哲', status: 'landed',
      departureLocation: 'Taipei, Taiwan', departureLatitude: 25.03, departureLongitude: 121.56,
      arrivalLocation: 'New York, USA', arrivalLatitude: 40.7, arrivalLongitude: -74.0,
      flightDurationMinutes: 460, landingTime: new Date(Date.now() - 3600000).toISOString(),
      captainBroadcast: '歡迎抵達紐約，清晨的哈德遜河正亮起來。',
    },
    {
      passengerName: '小柔', status: 'landed',
      departureLocation: 'Tokyo, Japan', departureLatitude: 35.68, departureLongitude: 139.69,
      arrivalLocation: 'Sydney, Australia', arrivalLatitude: -33.87, arrivalLongitude: 151.2,
      flightDurationMinutes: 495, landingTime: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
  clearMsg('main'); clearMsg('login');
  updateUI();
  Globe.flyTo(DEFAULT_COORD, 1000);
}

function doLogout() {
  previewMode = false;
  passenger = null;
  activeFlight = null;
  groupFlights = [];
  lastLandedFlight = null;
  landingScenery = null;
  resetTakeoffPrep();
  resetLandPrep();
  closeSheets();
  stopAutoRefresh();
  stopFlightTicker();
  stopLandingMusic();
  BroadcastAudio?.stopFlightSfx?.();
  Globe.clearRoute();
  clearMsg('main');
  updateUI();
}

// ── 自動更新 ─────────────────────────────────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (!passenger || previewMode) return;
    fetchBoard();
    if (passenger.status === 'in_flight') refreshProgress();
  }, 60000);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ── 事件繫結 ─────────────────────────────────────────────────────────────────

$('login-form').addEventListener('submit', doLogin);
$('btn-preview')?.addEventListener('click', enterDemoPreview);
$('btn-create-terminal')?.addEventListener('click', createRandomTerminal);
$('btn-share-terminal')?.addEventListener('click', () => { void shareTerminalLink('login'); });
$('btn-share-terminal-board')?.addEventListener('click', () => { void shareTerminalLink('board'); });
$('btn-takeoff').addEventListener('click', onTakeoffClick);
$('btn-land').addEventListener('click', onLandClick);
$('btn-logout').addEventListener('click', doLogout);
$('btn-theme').addEventListener('click', toggleTheme);
$('trail-mine')?.addEventListener('click', () => toggleRouteTrail('mine'));
$('trail-friends')?.addEventListener('click', () => toggleRouteTrail('friends'));

$('board-head').addEventListener('click', () => {
  const card = $('board-card');
  card.classList.toggle('open');
  if (card.classList.contains('open')) void fetchBoard();
});
$('bd-broadcasts-head').addEventListener('click', () => $('bd-broadcasts-list').classList.toggle('hidden'));

$('bd-list').addEventListener('click', (e) => {
  const row = e.target.closest('.brow');
  if (!row) return;
  openMateFromBoard(groupFlights[+row.dataset.idx]);
});
$('bd-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('.brow');
  if (!row) return;
  e.preventDefault();
  openMateFromBoard(groupFlights[+row.dataset.idx]);
});

$('btn-compass').addEventListener('click', () => openSheet('compass-sheet'));
$('sheet-mask').addEventListener('click', closeSheets);
$('btn-close-mate')?.addEventListener('click', closeSheets);
document.querySelectorAll('.sheet .sheet-grip').forEach((grip) => {
  if (grip.id === 'btn-close-mate') return;
  grip.addEventListener('click', closeSheets);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.body.classList.contains('sheet-open')) return;
  closeSheets();
});
$('btn-fate').addEventListener('click', () => Compass.fate());
$('btn-compass-confirm').addEventListener('click', () => {
  primeMediaOnUserGesture();
  Compass.confirm();
});

$('btn-window').addEventListener('click', toggleWindow);
$('btn-flight-window').addEventListener('click', () => toggleFlightWindow());

$('btn-close-landed').addEventListener('click', dismissLandedPanel);
$('globe-svg')?.addEventListener('click', (e) => {
  if (isLandedPanelVisible()) {
    if (e.target.closest('.pt-pick')) return;
    dismissLandedPanel();
    return;
  }
  // 點空白處取消地圖軌跡焦點（看板詳情開著時不處理）
  if (globeFocusPid && !document.body.classList.contains('sheet-open')) {
    if (e.target.closest('.pt') || e.target.closest('.pt-pick')) return;
    globeFocusPid = null;
    Globe.clearMate();
    restoreGlobeView();
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

(async function initApp() {
  applyTheme(autoTheme());
  Compass.build();
  void ensureCities();

  // D3 為 defer 載入：確保 window load 後再初始化地球
  if (document.readyState === 'complete') Globe.init();
  else window.addEventListener('load', () => { Globe.init(); Globe.refreshPalette(); });

  // 點地球儀上的隊友點 → 只顯示該隊友運行軌跡（詳情改由看板開啟）
  Globe.setFriendPick((idx) => { if (groupFlights[idx]) showMateTrailsOnGlobe(groupFlights[idx]); });
  // 飛行中點地球儀航線或飛機 → 從該處縮放展開巡航舷窗
  Globe.setPlanePick(() => openFlightWindowFromGlobe());

  if (window.WorkshopLocal) await WorkshopLocal.probe();
  await loadCountryIso();
  preloadLandingVideos();
  bindFlightShadeDrag();
  bindFlightWindowDismiss();
  positionFlightWindow(flightWindowCenter());
  bindTerminalInput();
  const urlTerminalApplied = applyTerminalFromUrl();
  fillLoginForm(loadLoginProfile());
  if (urlTerminalApplied) {
    const digits = normalizeTerminalDigits(new URLSearchParams(location.search).get('terminal')
      || new URLSearchParams(location.search).get('t'));
    if (digits && $('input-group')) $('input-group').value = digits;
  }

  const forceLogin = new URLSearchParams(location.search).has('login') || urlTerminalApplied;
  const autoPreview = window.SLEEP_AIRLINE_AUTO_PREVIEW !== false;

  if (!forceLogin && autoPreview) enterDemoPreview();
  else updateUI();
})();
