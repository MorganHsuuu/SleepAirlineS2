// ── WORKSHOP 資料契約 ───────────────────────────────────────────────────────
// 改 UI 前請讀 docs/WORKSHOP_CONTRACT.md
// 必保留：doLogin / doTakeoff / doLand / fetchBoard / refreshProgress 的
//         API 路徑與 body 欄位名（passengerId, name, groupId, routeDirection…）
// 必保留：input-pid, input-name, input-group, tk-direction, btn-takeoff, btn-land 等 id
// 可任意改：視覺、文案、動畫；改完執行 npm run check:contract
// ────────────────────────────────────────────────────────────────────────────

'use strict';

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
const STATUS_LABEL = {
  not_started: '待起飛', in_flight: '飛行中', landed: '已降落',
  boarding: '準備登機', cancelled: '已取消',
};
const KM_PER_MINUTE = 12;                    // 與後端 distance.ts / workshop-local 一致
const DEFAULT_COORD = [121.5654, 25.033];    // Taipei
const AVATAR_COLORS = ['#d9a63a', '#5b8ed6', '#8f7fd0', '#5eae9d', '#d97f8e', '#7aa85e'];
const TICKET_STRIPS = [
  'linear-gradient(90deg,#f2a65e,#e97c6c)',
  'linear-gradient(90deg,#7fb0e0,#9a8fd8)',
  'linear-gradient(90deg,#6fc3b4,#8fd08a)',
  'linear-gradient(90deg,#e0a3c8,#b48fd8)',
];

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
};
const DEFAULT_CULTURE = '你降落在一座陌生的城市。深呼吸，帶著好奇心向當地人微笑問好——旅行最美的風景，往往是人與人的相遇。';

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
      }
      return;
    } catch { /* try next */ }
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

/** 由航班取出抵達地的國旗 / 國家名 / 當地文化 */
function arrivalMeta(f) {
  let iso = (f?.arrivalIso || '').toUpperCase();
  let country = f?.arrivalCountry || '';
  if (!iso) {
    const parts = String(f?.arrivalLocation || '').split(',');
    country = (parts[parts.length - 1] || '').trim();
    iso = NAME2ISO[country.toLowerCase()] || NAME2ISO[country] || '';
  }
  const info = iso ? CULTURE_BY_ISO[iso] : null;
  return {
    flag: isoToFlag(iso) || '🌍',
    country: country || info?.name || '未知空域',
    culture: info?.culture || DEFAULT_CULTURE,
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

function coordOf(obj, latKey, lngKey) {
  const lat = obj?.[latKey], lng = obj?.[lngKey];
  if (typeof lat === 'number' && typeof lng === 'number' && (lat || lng)) return [lng, lat];
  return null;
}

// ── Globe：全畫面地球儀（D3 · CDN 失敗時優雅退化）────────────────────────────

const Globe = (() => {
  let ok = false, svg, projection, path, graticule, land = null;
  let sphereEl, gratEl, gLand, gRoute, gPts, gradStops = [];
  let w = 0, h = 0, baseR = 200, k = 1;
  const HOME_ROT = [-DEFAULT_COORD[0], -20];
  let idleTimer = null, idleOn = true;
  let onFriendPick = null;
  let view = { you: null, friends: [], heading: null, traveledKm: 0, possibilityKm: 0, arrival: null, routeArc: null, planeC: null, mateArc: null };

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function anchorY() {
    const t = Math.max(0, Math.min(1, (1.15 - k) / 0.3));
    return h * (0.44 + t * 0.06);
  }

  function applyProjection() {
    projection.scale(baseR * k).translate([w / 2, anchorY()]);
  }

  function resize() {
    const stage = $('stage');
    w = stage.clientWidth; h = stage.clientHeight;
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    baseR = Math.min(w * 0.72, h * 0.42);
    applyProjection();
    render();
  }

  function refreshPalette() {
    if (!ok) return;
    const stops = [cssVar('--ocean-0'), cssVar('--ocean-1'), cssVar('--ocean-2')];
    gradStops.forEach((s, i) => s.attr('stop-color', stops[i]));
    render();
  }

  function visible(coord) {
    const r = projection.rotate();
    return d3.geoDistance(coord, [-r[0], -r[1]]) < Math.PI / 2;
  }

  function lineTo(from, to, steps = 40) {
    const ip = d3.geoInterpolate(from, to);
    return { type: 'LineString', coordinates: d3.range(0, steps + 1).map((i) => ip(i / steps)) };
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
    const routes = [];
    const youC = view.you?.c;
    if (view.routeArc) {
      routes.push({ d: lineTo(view.routeArc.from, view.routeArc.to), s: null, wd: 2.4, o: 1 });
    } else if (youC && view.heading != null) {
      const traveled = Math.max(view.traveledKm, 1);
      const planeC = destPoint(youC, view.heading, traveled);
      view.planeC = planeC;
      routes.push({ d: lineTo(youC, planeC), s: null, wd: 2.4, o: 1 });
      const hint = destPoint(youC, view.heading, traveled + 900);
      routes.push({ d: lineTo(planeC, hint), s: '4 5', wd: 1.4, o: 0.5 });
    } else if (youC && view.possibilityKm > 0) {
      // auto：可能圈
      const circle = d3.geoCircle().center(youC).radius(view.possibilityKm / 111.19)();
      routes.push({ d: circle, s: '3 5', wd: 1.3, o: 0.55 });
      view.planeC = null;
    }
    // 隊友航線（點看板成員後高亮的虛線大圓）
    if (view.mateArc) {
      routes.push({ d: lineTo(view.mateArc.from, view.mateArc.to), s: '5 6', wd: 1.9, o: 0.95 });
    }
    gRoute.selectAll('path').data(routes).join('path')
      .attr('d', (x) => path(x.d)).attr('fill', 'none')
      .attr('stroke', gold).attr('stroke-width', (x) => x.wd)
      .attr('stroke-dasharray', (x) => x.s).attr('opacity', (x) => x.o)
      .attr('stroke-linecap', 'round');

    // 點位圖層
    const friendCol = cssVar('--friend') || '#3b82f6';
    const labelInk = cssVar('--ink-soft') || '#33557f';
    const pts = [];
    if (view.you) pts.push({ key: 'you', c: view.you.c, label: view.you.label, kind: 'you' });
    view.friends.forEach((f, i) => pts.push({ key: 'f' + i + f.label, c: f.c, label: f.label + (f.flying ? ' ✈' : ''), kind: 'friend', idx: f.idx }));
    if (view.mateArc) {
      pts.push({ key: 'mateDep', c: view.mateArc.from, label: view.mateArc.depLabel, kind: 'friend' });
      pts.push({ key: 'mateArr', c: view.mateArc.to, label: view.mateArc.arrLabel, kind: 'arrival' });
    }
    if (view.arrival) pts.push({ key: 'arr', c: view.arrival.c, label: view.arrival.label, kind: 'arrival' });
    if (view.planeC && !view.routeArc) pts.push({ key: 'plane', c: view.planeC, kind: 'plane' });
    if (view.routeArc?.planeT != null) {
      pts.push({ key: 'plane', c: d3.geoInterpolate(view.routeArc.from, view.routeArc.to)(view.routeArc.planeT), kind: 'plane' });
    }
    const shown = pts.filter((p) => visible(p.c));

    const sel = gPts.selectAll('g.pt').data(shown, (d) => d.key);
    const ent = sel.enter().append('g').attr('class', 'pt');
    ent.append('circle').attr('class', 'halo');
    ent.append('circle').attr('class', 'core');
    ent.append('text').attr('class', 'lbl');
    sel.exit().remove();

    gPts.selectAll('g.pt').each(function (d) {
      const [x, y] = projection(d.c);
      const g = d3.select(this);
      if (d.kind === 'plane') {
        g.select('.halo').attr('r', 0); g.select('.core').attr('r', 0);
        g.select('.lbl').attr('x', x).attr('y', y + 5).attr('text-anchor', 'middle')
          .attr('font-size', '16px').attr('fill', gold).text('✈');
        return;
      }
      const main = d.kind !== 'friend';
      const col = main ? gold : friendCol;
      g.select('.halo').attr('cx', x).attr('cy', y).attr('r', main ? 10 : 7).attr('fill', col).attr('opacity', 0.18);
      g.select('.core').attr('cx', x).attr('cy', y).attr('r', main ? 4.5 : 3.5)
        .attr('fill', col).attr('stroke', '#fff').attr('stroke-width', 1.2);
      g.select('.lbl').attr('x', x).attr('y', y - 11).attr('text-anchor', 'middle')
        .attr('font-size', '9px').attr('font-weight', main ? '800' : '600')
        .attr('fill', labelInk).text(d.label || '');
      // 可點擊的隊友點：開啟該隊友航程詳情
      const clickable = d.kind === 'friend' && Number.isInteger(d.idx);
      g.style('cursor', clickable ? 'pointer' : null)
        .on('click', clickable ? (ev) => { ev.stopPropagation(); onFriendPick?.(d.idx); } : null);
    });
  }

  function setZoom(nk) {
    k = Math.max(0.62, Math.min(3.5, nk));
    applyProjection();
    render();
  }

  function flyTo(coord, duration = 1400, done) {
    if (!ok) { done?.(); return; }
    const target = [-coord[0], -coord[1] + 6];
    d3.transition().duration(duration).tween('rot', () => {
      const ir = d3.interpolate(projection.rotate(), target);
      return (t) => { projection.rotate(ir(t)); render(); };
    }).on('end', () => done?.());
  }

  function resetView() {
    if (!ok) return;
    const k0 = k, r0 = projection.rotate();
    const home = view.you ? [-view.you.c[0], -view.you.c[1] + 6] : HOME_ROT;
    d3.transition().duration(700).tween('reset', () => {
      const ik = d3.interpolate(k0, 1), ir = d3.interpolate(r0, home);
      return (t) => { k = ik(t); applyProjection(); projection.rotate(ir(t)); render(); };
    });
  }

  /** 降落滑行：飛機沿弧線滑至落點，鏡頭跟隨 */
  function glideToArrival(fromC, toC, done) {
    if (!ok) { done?.(); return; }
    view.routeArc = { from: fromC, to: toC, planeT: 0 };
    view.heading = null; view.possibilityKm = 0;
    const rot0 = projection.rotate();
    const target = [-toC[0], -toC[1] + 6];
    const t0 = performance.now(), DUR = 2100;
    (function frame(now) {
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

    el.addEventListener('pointerdown', (e) => {
      const now = Date.now();
      if (now - lastTap < 300 && touches.size === 0) { resetView(); lastTap = 0; return; }
      lastTap = now;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      const prev = touches.get(e.pointerId);
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 1) {
        const r = projection.rotate(), f = 0.35 / k;
        projection.rotate([
          r[0] + (e.clientX - prev[0]) * f,
          Math.max(-75, Math.min(75, r[1] - (e.clientY - prev[1]) * f)),
        ]);
        render();
      } else if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0) setZoom(k * (d / pinch));
        pinch = d;
      }
    });
    const end = (e) => { touches.delete(e.pointerId); pinch = 0; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      setZoom(k * (e.deltaY < 0 ? 1.08 : 0.92));
    }, { passive: false });
    el.addEventListener('dblclick', (e) => e.preventDefault());

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
    gPts = svg.append('g');

    new ResizeObserver(resize).observe($('stage'));
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
    /** 高亮某位隊友的航線（虛線大圓 + 起降點），並把鏡頭轉到航線中點 */
    focusMate(from, to, arrLabel, depLabel) {
      view.mateArc = { from, to, arrLabel, depLabel };
      // 停用自己的航向提示圖層，避免干擾
      view.heading = null; view.possibilityKm = 0; view.routeArc = null;
      idleOn = false;
      render();
      if (ok && from && to) {
        const mid = d3.geoInterpolate(from, to)(0.5);
        flyTo(mid, 900);
      }
    },
    clearMate() { view.mateArc = null; render(); },
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
  let needle = null, current = 'auto', angle = 0, dragging = false, spinning = false;

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
    if (current === 'auto') {
      dirEl.textContent = '自動';
      hintEl.textContent = '由系統為你選擇方向';
    } else {
      dirEl.textContent = DIRECTION_LABEL[current];
      hintEl.textContent = `今晚傾向醒在${DIRECTION_LABEL[current]}方的城市`;
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

    // 八方位熱點
    for (const d of DIRS) {
      const rad = toRad(d.a - 90);
      const hot = el('circle', {
        cx: 120 + 72 * Math.cos(rad), cy: 120 + 72 * Math.sin(rad),
        r: 17, fill: 'transparent',
      });
      hot.style.cursor = 'pointer';
      hot.addEventListener('click', (e) => { e.stopPropagation(); current = d.key; animateTo(d.a, 0); readout(); });
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
      dragging = true;
      holder.setPointerCapture(ev.pointerId);
      const a = angleOf(ev); setNeedle(a); current = nearest(a).key; readout();
    });
    holder.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const a = angleOf(ev); setNeedle(a); current = nearest(a).key; readout();
    });
    holder.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      pick(angle);
    });

    readout();
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
    closeSheets();
  }

  return { build, fate, reset, confirm, get value() { return current; } };
})();

// ── Sheet 管理 ───────────────────────────────────────────────────────────────

function openSheet(id) {
  $('sheet-mask').classList.add('show');
  $(id).classList.add('show');
}
function closeSheets() {
  $('sheet-mask').classList.remove('show');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
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

async function api(method, url, body) {
  if (window.WorkshopLocal?.isActive()) {
    return WorkshopLocal.handle(method, url, body);
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (window.WorkshopLocal) {
      WorkshopLocal.enable();
      return WorkshopLocal.handle(method, url, body);
    }
    if (err instanceof TypeError || err.message === 'Failed to fetch') {
      throw new Error('無法連線後端。本機預覽請確認 workshop-local.js 已載入；或執行 npm run dev 後開 http://localhost:3000');
    }
    throw err;
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? '伺服器回應格式錯誤，請稍後再試。' : (text.slice(0, 120) || `伺服器錯誤 (${res.status})`));
  }
  if (!res.ok) throw new Error(data.message || data.error || `伺服器錯誤 (${res.status})`);
  return data;
}

// ── 地球儀資料同步 ────────────────────────────────────────────────────────────

function friendsFromBoard() {
  if (!passenger) return [];
  return groupFlights
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.passengerName !== passenger.name)
    .map(({ f, idx }) => {
      const c = f.status === 'landed'
        ? coordOf(f, 'arrivalLatitude', 'arrivalLongitude')
        : coordOf(f, 'departureLatitude', 'departureLongitude');
      return c ? { c, label: f.passengerName, flying: f.status === 'in_flight', idx } : null;
    })
    .filter(Boolean);
}

function youCoord() {
  return coordOf(passenger, 'currentLatitude', 'currentLongitude') || DEFAULT_COORD;
}

function updateGlobeForReady() {
  if (!passenger) return;
  const dir = $('tk-direction').value;
  const bearing = DIRECTION_BEARING[dir];
  Globe.update({
    you: { c: youCoord(), label: `你 · ${cityOnly(passenger.currentLocation)}` },
    friends: friendsFromBoard(),
    heading: bearing ?? null,
    traveledKm: bearing != null ? 260 : 0,   // ready：短短一截航向提示
    possibilityKm: bearing == null ? 700 : 0,
    routeArc: null, arrival: null,
  });
}

function updateGlobeForFlight() {
  if (!activeFlight) return;
  const dep = coordOf(activeFlight, 'departureLatitude', 'departureLongitude') || youCoord();
  const dir = activeFlight.routeDirection;
  const bearing = DIRECTION_BEARING[dir];
  const km = minutesSince(activeFlight.takeoffTime) * KM_PER_MINUTE;
  Globe.update({
    you: { c: dep, label: cityOnly(activeFlight.departureLocation) },
    friends: friendsFromBoard(),
    heading: bearing ?? null,
    traveledKm: km,
    possibilityKm: bearing == null ? Math.max(km, 120) : 0,
    routeArc: null, arrival: null,
  });
}

// ── 飛行計時器（時長 + 距離）─────────────────────────────────────────────────

function startFlightTicker() {
  stopFlightTicker();
  const tick = () => {
    if (!activeFlight) return;
    const mins = minutesSince(activeFlight.takeoffTime);
    $('fl-duration').textContent = fmtDuration(mins);
    $('fl-distance').textContent = Math.round(mins * KM_PER_MINUTE).toLocaleString() + ' km';
    updateGlobeForFlight();
  };
  tick();
  flightTicker = setInterval(tick, 1000);
}
function stopFlightTicker() {
  if (flightTicker) { clearInterval(flightTicker); flightTicker = null; }
}

// ── 語音播放（含音波動畫）────────────────────────────────────────────────────

async function playBroadcastWithWave(text, style) {
  if (!text || !window.BroadcastAudio) return;
  const wave = $('voice-wave');
  wave?.classList.add('speaking');
  try { await BroadcastAudio.playCaptainBroadcast(text, style || 'formal_captain'); }
  finally { wave?.classList.remove('speaking'); }
}

// ── 票夾（localStorage）──────────────────────────────────────────────────────

const TICKETS_KEY = 'sleepAirline_tickets_v1';

function loadTickets() {
  try {
    const all = JSON.parse(localStorage.getItem(TICKETS_KEY) || '{}');
    return all[passenger?.passengerId] || [];
  } catch { return []; }
}
function saveTicket(t) {
  if (!passenger) return;
  try {
    const all = JSON.parse(localStorage.getItem(TICKETS_KEY) || '{}');
    const list = all[passenger.passengerId] || [];
    if (!list.some((x) => x.no === t.no)) list.unshift(t);
    all[passenger.passengerId] = list.slice(0, 60);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(all));
  } catch { /* storage full */ }
}
function ticketFromFlight(f) {
  return {
    no: (f.flightId || 'FL-????').slice(-9),
    date: (f.landingTime || new Date().toISOString()).slice(5, 10).replace('-', '/'),
    from: cityOnly(f.departureLocation), fromCode: codeify(f.departureLocation),
    to: cityOnly(f.arrivalLocation), toCode: codeify(f.arrivalLocation),
    dur: fmtDuration(f.flightDurationMinutes),
    km: f.estimatedFlightDistanceKm ? Math.round(f.estimatedFlightDistanceKm).toLocaleString() + ' km' : '—',
    dir: DIRECTION_LABEL[f.routeDirection] || '—',
  };
}
function renderTickets() {
  const list = previewMode
    ? [
        { no: 'FL-DEMO-01', date: '06/28', from: '台北', fromCode: 'TPE', to: '東京', toCode: 'NRT', dur: '7 小時 12 分', km: '2,100 km', dir: '東北' },
        { no: 'FL-DEMO-02', date: '06/25', from: '東京', fromCode: 'NRT', to: '雪梨', toCode: 'SYD', dur: '8 小時 45 分', km: '6,300 km', dir: '南' },
      ]
    : loadTickets();
  const shelf = $('tickets-list');
  if (!list.length) {
    shelf.innerHTML = '<div class="tickets-empty">還沒有票根——今晚起飛，醒來就有第一張 ✈</div>';
    return;
  }
  shelf.innerHTML = list.map((t, i) => `
    <div class="ticket">
      <div class="ticket-strip" style="background:${TICKET_STRIPS[i % TICKET_STRIPS.length]}">
        <span class="al">SLEEP AIRLINE</span><span class="no">${t.no} · ${t.date}</span>
      </div>
      <div class="ticket-body">
        <div class="ticket-route">
          <div><div class="ticket-code">${t.fromCode}</div><div class="ticket-city">${t.from}</div></div>
          <div class="ticket-mid"><div class="ln"></div><div class="pl">✈</div></div>
          <div style="text-align:right"><div class="ticket-code">${t.toCode}</div><div class="ticket-city">${t.to}</div></div>
        </div>
        <div class="ticket-meta">
          <span class="ticket-chip">🌙 ${t.dur}</span>
          <span class="ticket-chip">📏 ${t.km}</span>
          <span class="ticket-chip">🧭 ${t.dir}</span>
        </div>
      </div>
      <div class="ticket-foot">
        <span class="ticket-barcode">${'<i style="height:' + '"></i>'.repeat(0)}${Array.from({ length: 24 }, () => `<i style="height:${6 + Math.random() * 11}px"></i>`).join('')}</span>
        <span class="ticket-stamp">ARRIVED ✈ ${t.toCode}</span>
      </div>
    </div>`).join('');
}

// ── 看板 ─────────────────────────────────────────────────────────────────────

function renderBoard() {
  $('bd-group').textContent = passenger?.groupId || '—';
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
    const sub = flying
      ? `${cityOnly(f.departureLocation)} 出發 · 已飛 ${fmtDuration(minutesSince(f.takeoffTime))}`
      : f.status === 'landed'
        ? `${cityOnly(f.arrivalLocation) || '—'} · 飛了 ${fmtDuration(f.flightDurationMinutes)}`
        : STATUS_LABEL[f.status] || f.status;
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
      if (f.captainBroadcast) parts.push(`<div class="board-bc-meta">${f.passengerName} · 降落 → ${cityOnly(f.arrivalLocation) || '?'}</div><div class="board-bc-text">${f.captainBroadcast}</div>`);
      return `<div class="board-bc-item">${parts.join('')}</div>`;
    }).join('');
  }
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
  const country = landingScenery?.country
    || (lastLandedFlight ? arrivalMeta(lastLandedFlight).country : '');
  $('scenery-caption').textContent = '📍 ' + place + (country ? ' · ' + country : '');

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

// ── 隊友航程詳情（點小隊看板成員）────────────────────────────────────────────

let mateSceneryToken = 0;

function openMateSheet(f) {
  if (!f) return;
  const meta = arrivalMeta(f);
  const landed = f.status === 'landed';
  const flying = f.status === 'in_flight';

  $('mate-flag').textContent = landed ? meta.flag : (flying ? '🛫' : '🧳');
  $('mate-name').textContent = f.passengerName || '隊友';
  $('mate-status').textContent = landed
    ? `已降落 · ${meta.country}`
    : (STATUS_LABEL[f.status] || f.status);

  // 已降落：用視覺化航線帶（起點 ┈✈┈ 終點＋國旗）；其它狀態：文字說明
  const arc = $('mate-arc');
  if (landed) {
    arc.hidden = false;
    $('ma-dep').textContent = cityOnly(f.departureLocation) || '—';
    $('ma-arr').textContent = cityOnly(f.arrivalLocation) || '?';
    $('ma-arc-flag').textContent = meta.flag;
    $('mate-route').textContent = meta.country ? `抵達 ${meta.country}` : '';
    $('mate-route').classList.toggle('hidden', !meta.country);
  } else {
    arc.hidden = true;
    $('mate-route').classList.remove('hidden');
    $('mate-route').textContent = flying
      ? `${cityOnly(f.departureLocation)} 出發 · 已飛 ${fmtDuration(minutesSince(f.takeoffTime))}`
      : (cityOnly(f.departureLocation) || '—');
  }

  const chips = [];
  if (landed) {
    chips.push(`🌙 ${fmtDuration(f.flightDurationMinutes)}`);
    if (f.estimatedFlightDistanceKm) {
      chips.push(`📏 ${Math.round(f.estimatedFlightDistanceKm).toLocaleString()} km`);
    }
  }
  if (f.routeDirection && DIRECTION_LABEL[f.routeDirection]) {
    chips.push(`🧭 ${DIRECTION_LABEL[f.routeDirection]}`);
  }
  $('mate-meta').innerHTML = chips.map((c) => `<span class="meta-chip">${c}</span>`).join('');

  $('mate-bc-text').textContent = f.captainBroadcast || f.takeoffBroadcast || '這位隊友還沒有機長廣播。';
  const cue = $('mate-cue');
  cue.classList.toggle('hidden', !f.socialCueText);
  cue.textContent = f.socialCueText ? '◎ ' + f.socialCueText : '';

  // 在地球儀上高亮這位隊友的航線（虛線 + 起降點）
  const dep = coordOf(f, 'departureLatitude', 'departureLongitude');
  const arr = coordOf(f, 'arrivalLatitude', 'arrivalLongitude');
  if (landed && dep && arr) {
    Globe.focusMate(dep, arr, `${cityOnly(f.arrivalLocation)}${meta.flag ? ' ' + meta.flag : ''}`, cityOnly(f.departureLocation));
  } else if (dep) {
    Globe.clearMate();
    Globe.flyTo(dep, 900);
  }

  renderMateScenery(f, meta, landed);
  openSheet('mate-sheet');
}

async function renderMateScenery(f, meta, landed) {
  const win = $('mate-window');
  if (!landed || !f.arrivalLocation) { win.hidden = true; return; }
  win.hidden = false;

  const scene = $('mate-scene');
  const img = $('mate-img');
  const fallback = $('mate-fallback');
  const token = ++mateSceneryToken;

  $('mate-caption').textContent = '📍 ' + (cityOnly(f.arrivalLocation) || '') +
    (meta.country ? ' · ' + meta.country : '');
  img.hidden = true; img.removeAttribute('src');
  fallback.innerHTML = '';
  scene.querySelector('.pw-empty')?.remove();
  $('mate-loading').classList.remove('hidden');

  let scenery = null;
  try {
    if (f.flightId) {
      const data = await api('GET', '/api/scenery?flightId=' + encodeURIComponent(f.flightId));
      scenery = data.scenery || null;
    }
  } catch { scenery = null; }
  if (token !== mateSceneryToken) return;   // 已切換到其他隊友

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
    // 沒有 AI 生圖時，用晨景 SVG 當窗外預覽（與自己的降落面板一致）
    img.hidden = true;
    fallback.hidden = false;
    fallback.innerHTML = buildWindowScene(cityOnly(f.arrivalLocation) || 'sky');
  }
}

// ── 機窗開合（點飛機 → 展開/收合窗外風景）────────────────────────────────────

function setWindowOpen(open) {
  const btn = $('btn-window');
  const win = $('plane-window');
  if (!btn || !win) return;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  win.hidden = !open;
  $('wt-label').textContent = open ? '收合窗外風景' : '點我看看窗外風景';
  if (open) renderSceneryCard(false);
}
function toggleWindow() {
  setWindowOpen($('btn-window').getAttribute('aria-expanded') !== 'true');
}

// ── 抵達慶祝動畫 ─────────────────────────────────────────────────────────────

let celebratedFlightId = null;
function celebrateArrival(flightId) {
  if (!flightId || celebratedFlightId === flightId) return;
  celebratedFlightId = flightId;
  const burst = $('arrival-burst');
  if (burst) { burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go'); }
  // 抵達即自動展開機窗，直接露出窗外風景（AI 圖或晨景），仍可再點擊收合
  setWindowOpen(true);
  // 面板可能較高，捲回頂端讓「國旗＋城市＋ARRIVED」的抵達感先被看見
  const panel = $('landed-panel');
  if (panel) requestAnimationFrame(() => { panel.scrollTop = 0; });
}

// ── 降落過場 ─────────────────────────────────────────────────────────────────

function showLandingFx(sub) {
  const fx = $('landing-fx');
  if (!fx) return;
  if (sub) { const s = $('landing-fx-sub'); if (s) s.textContent = sub; }
  fx.classList.add('show');
}
function hideLandingFx() {
  $('landing-fx')?.classList.remove('show');
}

// ── 主 UI 狀態機 ─────────────────────────────────────────────────────────────

function updateUI() {
  const loggedIn = !!passenger;
  $('login-section').classList.toggle('hidden', loggedIn);
  $('main-section').classList.toggle('hidden', !loggedIn);
  $('hdr-preview-hint')?.classList.toggle('hidden', !previewMode);
  if (!passenger) { Globe.setIdle(true); return; }

  const isFlying = passenger.status === 'in_flight';
  $('hdr-badge').textContent = STATUS_LABEL[passenger.status] || passenger.status;

  const showLanded = !isFlying && !!lastLandedFlight && !$('landed-panel').dataset.dismissed;
  $('ready-panel').classList.toggle('hidden', isFlying || showLanded);
  $('flight-panel').classList.toggle('hidden', !isFlying);
  $('landed-panel').classList.toggle('hidden', !showLanded);

  if (isFlying && activeFlight) {
    $('fl-direction').textContent = '🧭 ' + (DIRECTION_LABEL[activeFlight.routeDirection] || activeFlight.routeDirection);
    Globe.setIdle(false);
    startFlightTicker();
  } else {
    stopFlightTicker();
    Globe.setIdle(!showLanded);
  }

  if (!isFlying && !showLanded) {
    $('tk-departure').textContent = '✈ ' + (passenger.currentLocation || '—');
    updateGlobeForReady();
  }

  if (showLanded) {
    const meta = arrivalMeta(lastLandedFlight);
    $('bc-flag').textContent = meta.flag;
    $('bc-route').textContent = cityOnly(lastLandedFlight.arrivalLocation) || '未知目的地';
    $('bc-country').textContent = meta.country;
    $('bc-origin').textContent = '✈ 從 ' + (cityOnly(lastLandedFlight.departureLocation) || '—') + ' 出發';
    $('bc-stamp').textContent = 'ARRIVED ✈ ' + codeify(lastLandedFlight.arrivalLocation);
    $('bc-duration').textContent = '🌙 ' + fmtDuration(lastLandedFlight.flightDurationMinutes);
    $('bc-distance').textContent = '📏 ' + (lastLandedFlight.estimatedFlightDistanceKm
      ? Math.round(lastLandedFlight.estimatedFlightDistanceKm).toLocaleString() + ' km' : '—');
    $('bc-culture-text').textContent = meta.culture;
    $('bc-text-inner').textContent = lastLandedFlight.captainBroadcast || '（機長廣播生成中或未啟用）';
    const cue = $('bc-cue');
    cue.classList.toggle('hidden', !lastLandedFlight.socialCueText);
    cue.textContent = lastLandedFlight.socialCueText ? '◎ ' + lastLandedFlight.socialCueText : '';
    renderSceneryCard(false);
    celebrateArrival(lastLandedFlight.flightId || lastLandedFlight.notionId || 'landed');
  }

  renderBoard();
}

// ── 契約 API 動作（doLogin / doTakeoff / doLand / fetchBoard / refreshProgress）──

async function doLogin(e) {
  e.preventDefault();
  clearMsg('login');
  const passengerId = $('input-pid').value.trim();
  const name = $('input-name').value.trim();
  const groupId = $('input-group').value.trim();
  if (!passengerId || !name || !groupId) { showMsg('login', 'error', '請填寫所有欄位。'); return; }

  $('btn-login').disabled = true;
  try {
    const data = await api('POST', '/api/passenger', { passengerId, name, groupId });
    previewMode = false;
    passenger = data.passenger;
    lastLandedFlight = data.lastLandedFlight || null;
    landingScenery = data.landingScenery || null;
    delete $('landed-panel').dataset.dismissed;
    saveLoginProfile({ passengerId, name, groupId });
    if (lastLandedFlight) saveTicket(ticketFromFlight(lastLandedFlight));
    await fetchBoard();
    if (passenger.status === 'in_flight') await refreshProgress();
    updateUI();
    Globe.flyTo(youCoord(), 1200);
    startAutoRefresh();
  } catch (err) {
    showMsg('login', 'error', err.message);
  } finally {
    $('btn-login').disabled = false;
  }
}

async function doTakeoff() {
  if (previewMode) {
    showMsg('main', 'error', '目前為 UI 示範。請先登出，登入後再測試起飛。');
    return;
  }
  clearMsg('main');
  const btn = $('btn-takeoff');
  btn.disabled = true;
  try {
    const data = await api('POST', '/api/flight/takeoff', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
      routeDirection: $('tk-direction').value,
    });
    activeFlight = data.flight;
    passenger.status = 'in_flight';
    lastLandedFlight = null;
    landingScenery = null;
    delete $('landed-panel').dataset.dismissed;

    // 起飛過場：雲層 + 機身爬升
    const fx = $('takeoff-fx');
    fx.classList.remove('play'); void fx.offsetWidth; fx.classList.add('play');
    setTimeout(() => {
      updateUI();
      Globe.flyTo(youCoord(), 1400);
    }, 1100);
    setTimeout(() => fx.classList.remove('play'), 2700);

    await fetchBoard();
    startAutoRefresh();
    if (activeFlight.takeoffBroadcast) {
      playBroadcastWithWave(activeFlight.takeoffBroadcast, activeFlight.takeoffBroadcastStyle);
    }
  } catch (err) {
    showMsg('main', 'error', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function doLand() {
  if (previewMode) {
    showMsg('main', 'error', '目前為 UI 示範。請先登出，登入後再測試降落。');
    return;
  }
  clearMsg('main');
  const btn = $('btn-land');
  btn.disabled = true;
  renderSceneryCard(true);
  showLandingFx('正在生成機長廣播與窗外風景');
  try {
    const data = await api('POST', '/api/flight/land', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
    });
    const landed = data.flight;
    lastLandedFlight = landed;
    landingScenery = data.landingScenery || null;
    passenger.status = 'landed';
    passenger.currentLocation = landed.arrivalLocation || passenger.currentLocation;
    if (typeof landed.arrivalLatitude === 'number') {
      passenger.currentLatitude = landed.arrivalLatitude;
      passenger.currentLongitude = landed.arrivalLongitude;
    }
    saveTicket(ticketFromFlight(landed));
    stopFlightTicker();
    delete $('landed-panel').dataset.dismissed;

    // 降落滑行 → 抵達面板
    const dep = coordOf(landed, 'departureLatitude', 'departureLongitude') || DEFAULT_COORD;
    const arr = coordOf(landed, 'arrivalLatitude', 'arrivalLongitude');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      hideLandingFx();
      activeFlight = null;
      if (arr) Globe.update({ you: { c: arr, label: `你 · ${cityOnly(landed.arrivalLocation)}` }, arrival: null });
      updateUI();
    };
    if (arr && Globe.ok) Globe.glideToArrival(dep, arr, finish);
    else finish();
    // 保險：即使滑行動畫（requestAnimationFrame）因切換分頁被暫停，也一定抵達
    setTimeout(finish, 2600);

    await fetchBoard();
    if (landed.captainBroadcast) {
      playBroadcastWithWave(landed.captainBroadcast, landed.captainBroadcastStyle || landed.takeoffBroadcastStyle);
    }
  } catch (err) {
    hideLandingFx();
    landingScenery = null;
    renderSceneryCard(false);
    showMsg('main', 'error', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function fetchBoard() {
  if (!passenger) return;
  try {
    const data = await api('GET', '/api/board?groupId=' + encodeURIComponent(passenger.groupId));
    if (data.flights) groupFlights = data.flights;
    renderBoard();
    if (passenger.status !== 'in_flight') updateGlobeForReady();
  } catch { /* silent */ }
}

async function refreshProgress() {
  if (!passenger) return;
  try {
    const data = await api('GET', '/api/flight/progress?passengerId=' + encodeURIComponent(passenger.passengerId));
    activeFlight = data.activeFlight || null;
    if (!activeFlight && passenger.status === 'in_flight') passenger.status = 'landed';
    if (activeFlight) passenger.status = 'in_flight';
    updateUI();
  } catch { /* silent */ }
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
  $('input-group').value = p.groupId;
}

// ── UI 示範（不需登入、不需後端）────────────────────────────────────────────

function enterDemoPreview() {
  previewMode = true;
  stopAutoRefresh();
  stopFlightTicker();

  passenger = {
    passengerId: 'demo_preview', name: '示範乘客', groupId: 'group_01',
    status: 'not_started', currentLocation: 'Taipei, Taiwan',
    currentLatitude: 25.033, currentLongitude: 121.5654,
  };
  activeFlight = null;
  lastLandedFlight = null;
  landingScenery = null;
  groupFlights = [
    {
      passengerName: 'Amy', status: 'in_flight',
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
  stopAutoRefresh();
  stopFlightTicker();
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
$('btn-takeoff').addEventListener('click', doTakeoff);
$('btn-land').addEventListener('click', doLand);
$('btn-logout').addEventListener('click', doLogout);
$('btn-refresh').addEventListener('click', (e) => { e.stopPropagation(); fetchBoard(); });
$('btn-theme').addEventListener('click', toggleTheme);

$('board-head').addEventListener('click', () => $('board-card').classList.toggle('open'));
$('bd-broadcasts-head').addEventListener('click', () => $('bd-broadcasts-list').classList.toggle('hidden'));

$('bd-list').addEventListener('click', (e) => {
  const row = e.target.closest('.brow');
  if (!row) return;
  openMateSheet(groupFlights[+row.dataset.idx]);
});
$('bd-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('.brow');
  if (!row) return;
  e.preventDefault();
  openMateSheet(groupFlights[+row.dataset.idx]);
});

$('btn-compass').addEventListener('click', () => openSheet('compass-sheet'));
$('btn-tickets').addEventListener('click', () => { renderTickets(); openSheet('tickets-sheet'); });
$('sheet-mask').addEventListener('click', closeSheets);
$('btn-fate').addEventListener('click', () => Compass.fate());
$('btn-compass-confirm').addEventListener('click', () => Compass.confirm());

$('btn-window').addEventListener('click', toggleWindow);

$('btn-close-landed').addEventListener('click', () => {
  $('landed-panel').dataset.dismissed = '1';
  updateUI();
});

// ── Init ─────────────────────────────────────────────────────────────────────

(async function initApp() {
  applyTheme(autoTheme());
  Compass.build();

  // D3 為 defer 載入：確保 window load 後再初始化地球
  if (document.readyState === 'complete') Globe.init();
  else window.addEventListener('load', () => { Globe.init(); Globe.refreshPalette(); });

  // 點地球儀上的隊友點 → 開啟該隊友航程詳情
  Globe.setFriendPick((idx) => { if (groupFlights[idx]) openMateSheet(groupFlights[idx]); });

  if (window.WorkshopLocal) await WorkshopLocal.probe();
  await loadCountryIso();
  fillLoginForm(loadLoginProfile());

  const forceLogin = new URLSearchParams(location.search).has('login');
  const autoPreview = window.SLEEP_AIRLINE_AUTO_PREVIEW !== false;

  if (!forceLogin && autoPreview) enterDemoPreview();
  else updateUI();
})();
