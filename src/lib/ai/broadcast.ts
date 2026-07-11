import OpenAI from 'openai';
import type { BroadcastStyle, NarrativeRegion } from '../../types';
import type { SocialCue } from '../../types';
import type { LocalContext } from '../flight/local-context';

const STYLE_DESCRIPTIONS: Record<BroadcastStyle, string> = {
  formal_captain: '語氣沉穩、簡潔，像深夜航班的真正機長，不說套話。',
  poetic: '語氣詩意、意象清楚，一兩個畫面即可，不堆砌形容。',
  playful: '語氣輕鬆、帶一點幽默，但仍像機長在廣播，不過度玩笑。',
  flight_attendant: '語氣溫柔、簡短，像夜航廣播，不是客服稿。',
  radio_host: '語氣像深夜電台，但你是機長，不是主持人本人。',
  custom: '語氣由你拿捏，仍須符合甦醒航班夜航機長身分。',
};

const DIRECTION_LABEL: Record<string, string> = {
  auto: '自動航線',
  eastbound: '向東',
  westbound: '向西',
  northbound: '向北',
  southbound: '向南',
  northeast: '東北',
  northwest: '西北',
  southeast: '東南',
  southwest: '西南',
  circular: '環形',
  unknown: '未定',
};

export type BroadcastPhase = 'takeoff' | 'landing';

interface BroadcastInput {
  phase: BroadcastPhase;
  passengerName: string;
  departureLocation: string;
  arrivalLocation: string | null;
  narrativeRegion: NarrativeRegion;
  flightDurationMinutes: number | null;
  flightProgress: number;
  estimatedDistanceKm: number | null;
  routeDirection: string;
  socialCue: SocialCue;
  style: BroadcastStyle;
  /** 抵達地或出發地的當地文化／天氣（降落必帶，起飛可帶出發地） */
  localContext?: LocalContext | null;
}

function passengerLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '這位乘客';
  return trimmed.replace(/(?:先生|女士|小姐)$/u, '').trim() || '這位乘客';
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} 小時 ${m} 分鐘`;
  if (h > 0) return `${h} 小時`;
  return `${m} 分鐘`;
}

function hasChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function broadcastLocationLabel(location: string | null, localContext?: LocalContext | null): string {
  const raw = (location ?? '').trim();
  if (!raw) return '目前航站';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts[0] ?? raw;
  const country = parts[parts.length - 1] ?? '';
  if (hasChinese(city)) return raw;
  if (localContext?.countryName && hasChinese(localContext.countryName)) return `${localContext.countryName}一帶`;
  if (hasChinese(country)) return `${country}一帶`;
  return '當地航站';
}

function buildSocialBlock(cue: SocialCue): string {
  const lines = [`類型：${cue.cueType}`, `系統提示：${cue.cueText}`];
  if (cue.relatedPassenger) lines.push(`相關乘客：${cue.relatedPassenger}`);
  return lines.join('\n');
}

function buildLocalBlock(ctx: LocalContext, phase: BroadcastPhase): string {
  const lines = [
    `城市：${ctx.cityName}`,
    `國家：${ctx.countryName}`,
    `當地文化／社交特色：${ctx.culture}`,
  ];
  if (phase === 'landing' && ctx.morningGreeting) {
    lines.push(`當地語言早安（廣播第一句必須使用）：${ctx.morningGreeting}`);
  }
  if (ctx.weatherSummary) lines.push(`當地天氣：${ctx.weatherSummary}`);
  if (ctx.localTimeLabel) lines.push(`時段：${ctx.localTimeLabel}`);
  lines.push(
    phase === 'landing'
      ? '請改寫成抵達後給乘客的一兩句在地提示（問候、飲食、社交禮儀等），勿整段照搬。'
      : '僅可改寫出發地的一筆天氣或在地氛圍，勿暗示目的地。'
  );
  return lines.join('\n');
}

export async function generateCaptainBroadcast(input: BroadcastInput): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 尚未設定。');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const isTakeoff = input.phase === 'takeoff';
  const pax = passengerLabel(input.passengerName);
  const direction = DIRECTION_LABEL[input.routeDirection] ?? input.routeDirection;
  const hasLocal = !!input.localContext;
  const departureLabel = broadcastLocationLabel(input.departureLocation, isTakeoff ? input.localContext : null);
  const arrivalLabel = broadcastLocationLabel(input.arrivalLocation, !isTakeoff ? input.localContext : null);

  const systemPrompt = `你是「甦醒航班 Sleep Airline」的機長，正在對機上乘客做夜間廣播。
${STYLE_DESCRIPTIONS[input.style]}

身分（非常重要）：
- 你是機長，在對「乘客」說話；乘客姓名只是對象，不是你的名字
- 第一句必須自然包含「歡迎搭乘 Sleep Airline」與「這裡是機長」（「歡迎」二字不可省略，禁止只寫「搭乘 Sleep Airline」）${isTakeoff ? '' : '；若有當地語言早安，早安為第一句，「歡迎搭乘 Sleep Airline，這裡是機長」必須完整出現在第二句開頭'}
- 禁止寫「我是機長〇〇」若〇〇是乘客姓名
- 禁止冒充乘客、禁止用第一人稱代替乘客說話
- 用「各位乘客」或「${pax}」稱呼對方；不要稱自己為乘客姓名
- 稱呼乘客時直接使用名字，禁止附加「先生」「女士」「小姐」或「先生／女士」

地理（非常重要）：
- 使用【廣播用地名】；不要照念難懂的羅馬字、音標、撇號地名
- 起飛時本班目的地未知：只講出發地與航向；「醒來才知道目的地」類意思最多自然帶過一次
- 起飛廣播禁止提本班：飛行時長、預計抵達、公里數、ETA、約 X 分鐘／小時
- 【同組社交】的地名都是隊友的，不是本班航線；必須掛在隊友名字後面
- 隊友只能寫已發生：已起飛、已飛 X、已降落在 Y；禁止隊友「即將／X 分鐘內／快」降落、下降、抵達
- 若【同組社交】顯示有人仍在飛或只有部分人降落，禁止改寫成「隊友們都已成功降落」
- 禁止把隊友的空域或距離換算成降落倒數
- 所有地理描述須與本班航向一致，不得自相矛盾

${hasLocal ? `當地資訊（${isTakeoff ? '出發地' : '抵達地'}）：
- 【當地資訊】中的文化、天氣僅供改寫融入，禁止整段照搬或列點
- 降落廣播：必須用一兩句自然帶出當地文化特色或社交習俗，並點一下當地天氣（溫度、晴雨），
  像機長提醒乘客下機前的心理準備，不要像氣象報告或旅遊手冊
- 降落廣播：第一句必須以【當地語言早安】開頭（使用 morningGreeting，如 Bonjour、おはようございます），
  緊接繁體中文繼續廣播，不要翻譯或解釋那句問候
- 起飛廣播：若提供出發地天氣，最多一句帶過，勿喧賓奪主
` : ''}
寫作：
- 繁體中文，${isTakeoff ? '75–95' : '90–130'} 字，最多不超過 ${isTakeoff ? '105' : '160'} 字
- ${isTakeoff ? '起飛廣播固定 3–4 句：①歡迎搭乘 Sleep Airline＋機長身分＋出發地＋航向 ②一句夜航入睡/醒來抵達的詩意提醒 ③同組社交最多一句 ④輕聲祝眠' : '一句一重點'}
- 刪掉「有任何需求」「感謝選搭本航空」「祝您旅途愉快」「期待美好瞬間」等套話
- 禁止輸出「這是一個甦醒航班，睡著飛行，醒來抵達」這種直白標語；要改成有畫面的機長廣播
- 社交資訊改寫後嵌入一句即可，禁止照搬【同組社交】原文
- 不得編造未提供的地名、時間、人名；相關乘客只能用系統提供的名字
- 直接輸出廣播正文，不加標題、引號或說明`;

  const socialLine = input.socialCue.cueType === 'solo'
    ? '（同組暫無其他航班，可略過社交句，或一句「小隊雷達上今晚只有你一人」）'
    : buildSocialBlock(input.socialCue);

  const takeoffUser = `【起飛廣播】
乘客：${pax}
出發地原始資料：${input.departureLocation}
廣播用地名：${departureLabel}
航線方向：${direction}
${input.localContext ? `\n【當地資訊 · 出發地】\n${buildLocalBlock(input.localContext, 'takeoff')}\n` : ''}
【同組社交】
${socialLine}

請依「3–4 句」結構寫一段流暢口語廣播，第一句必須以「歡迎搭乘 Sleep Airline，這裡是機長」開頭（完整八字「歡迎搭乘」，不可省略「歡迎」）。
同組社交若有：用一句過去式／進行式帶過，禁止隊友降落倒數。`;

  const duration = formatDuration(input.flightDurationMinutes);
  const landingUser = `【降落廣播】
乘客：${pax}
出發地原始資料：${input.departureLocation}
出發地廣播用地名：${broadcastLocationLabel(input.departureLocation)}
抵達地原始資料：${input.arrivalLocation ?? '未知'}
抵達地廣播用地名：${arrivalLabel}
飛行時長：${duration || '未知'}
航程：${input.estimatedDistanceKm ? `${Math.round(input.estimatedDistanceKm)} 公里` : '未知'}
航線方向：${direction}
${input.localContext ? `\n【當地資訊 · 抵達地】\n${buildLocalBlock(input.localContext, 'landing')}\n` : ''}
【同組社交】
${buildSocialBlock(input.socialCue)}

請宣布：醒來抵達、飛了多久、從哪到哪；第一句以當地語言早安開頭，第二句必須以「歡迎搭乘 Sleep Airline，這裡是機長」完整開頭（「歡迎」不可省略、禁止只寫「搭乘 Sleep Airline」），
必須融入一筆當地文化或天氣（改寫）；用一句話點出社交情境，合併成一段流暢廣播，勿列點、勿照搬。`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: isTakeoff ? takeoffUser : landingUser },
    ],
    max_tokens: isTakeoff ? 220 : 280,
    temperature: isTakeoff ? 0.42 : 0.55,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '廣播生成失敗，請重試。';
  return ensureWelcomeAboardPhrase(raw);
}

/** 起飛／降落廣播必須含「歡迎搭乘 Sleep Airline」；模型若省略「歡迎」則補上 */
function ensureWelcomeAboardPhrase(text: string): string {
  const body = (text || '').trim();
  if (!body) {
    return '歡迎搭乘 Sleep Airline，這裡是機長。';
  }
  if (/歡迎搭乘\s*Sleep\s*Airline/i.test(body)) return body;
  if (/搭乘\s*Sleep\s*Airline/i.test(body)) {
    return body.replace(/搭乘\s*Sleep\s*Airline/i, '歡迎搭乘 Sleep Airline');
  }
  // 若以當地語言早安開頭，插在問候之後，避免蓋掉 morningGreeting
  const greet = body.match(/^(.{1,48}[!！.。…]+)(\s*)/);
  if (greet && !/[\u4e00-\u9fff]{4,}/.test(greet[1])) {
    return `${greet[1]}${greet[2] || ' '}歡迎搭乘 Sleep Airline，這裡是機長。${body.slice(greet[0].length)}`;
  }
  return `歡迎搭乘 Sleep Airline，這裡是機長。${body}`;
}

/** OpenAI 不可用時的簡短 fallback */
export function fallbackCaptainBroadcast(
  phase: BroadcastPhase,
  passengerName: string,
  departureLocation: string,
  arrivalLocation: string | null,
  routeDirection: string,
  durationMinutes: number | null,
  socialCueText: string,
  localContext?: LocalContext | null
): string {
  const pax = passengerLabel(passengerName);
  const direction = DIRECTION_LABEL[routeDirection] ?? routeDirection;
  const departureLabel = broadcastLocationLabel(departureLocation, phase === 'takeoff' ? localContext : null);
  const arrivalLabel = broadcastLocationLabel(arrivalLocation, phase === 'landing' ? localContext : null);
  if (phase === 'takeoff') {
    const wx = localContext?.weatherSummary
      ? `${localContext.localTimeLabel ?? '此刻'}${localContext.weatherSummary}，`
      : '';
    const social = socialCueText?.trim() && !/獨自飛行|只有你一人/.test(socialCueText)
      ? ` ${socialCueText.replace(/[。！？\s]+$/g, '')}。`
      : '';
    return `歡迎搭乘 Sleep Airline，這裡是機長，各位乘客，本班自 ${departureLabel} 起飛，航向${direction}。${wx ? wx : ''}請安心入睡，窗外的夜色會替我們保管目的地。${social}祝各位好眠。`;
  }
  const dur = formatDuration(durationMinutes);
  const greet = localContext?.morningGreeting ? `${localContext.morningGreeting}！` : '';
  const timeBit = localContext?.localTimeLabel ? `${localContext.localTimeLabel}，` : '本地時間清晨，';
  const wxBit = localContext?.weatherSummary ? `窗外${localContext.weatherSummary}。` : '';
  const cultureBit = localContext?.culture
    ? localContext.culture.split('；')[0]?.split('。')[0] + '。'
    : '走出艙門，向當地人微笑問好吧。';
  return `${greet}歡迎搭乘 Sleep Airline，這裡是機長，各位乘客，本班已平安降落 ${arrivalLabel}，${timeBit}${wxBit}${pax} 自 ${departureLabel} 出發，共飛行 ${dur || '一段'}。${cultureBit} ${socialCueText}`;
}
