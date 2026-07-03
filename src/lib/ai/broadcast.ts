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
  if (/先生|女士|小姐/.test(trimmed)) return trimmed;
  return `${trimmed}先生／女士`;
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} 小時 ${m} 分鐘`;
  if (h > 0) return `${h} 小時`;
  return `${m} 分鐘`;
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

  const systemPrompt = `你是「甦醒航班 Sleep Airline」的機長，正在對機上乘客做夜間廣播。
${STYLE_DESCRIPTIONS[input.style]}

身分（非常重要）：
- 你是機長，在對「乘客」說話；乘客姓名只是對象，不是你的名字
- 禁止寫「我是機長〇〇」若〇〇是乘客姓名
- 禁止冒充乘客、禁止用第一人稱代替乘客說話
- 用「各位乘客」或「${pax}」稱呼對方

地理（非常重要）：
- 起飛時目的地是未知的：只能講出發地與航向，禁止推測、暗示航線會經過或抵達哪些城市、國家
- 【同組社交】裡的地名是「隊友」的位置，不是你的航線；提到時必須明確掛在隊友名字上，
  禁止說成本機正飛過、穿越或靠近那些地方（例：隊友在東京 ≠ 你飛過東京）
- 所有地理描述必須與「航線方向」一致，不得自相矛盾

${hasLocal ? `當地資訊（${isTakeoff ? '出發地' : '抵達地'}）：
- 【當地資訊】中的文化、天氣僅供改寫融入，禁止整段照搬或列點
- 降落廣播：必須用一兩句自然帶出當地文化特色或社交習俗，並點一下當地天氣（溫度、晴雨），
  像機長提醒乘客下機前的心理準備，不要像氣象報告或旅遊手冊
- 起飛廣播：若提供出發地天氣，最多一句帶過，勿喧賓奪主
` : ''}
寫作：
- 繁體中文，${isTakeoff ? '70–100' : '90–130'} 字，最多不超過 ${isTakeoff ? '120' : '160'} 字
- 一句一重點，刪掉「有任何需求」「感謝選搭本航空」「祝您旅途愉快」等空泛套話
- 甦醒航班語境：這是一趟「睡著飛行、醒來抵達」的夜航體驗
- 社交資訊要改寫成自然、有趣的一兩句，融入廣播，不要整段照搬系統提示
- 不得編造未提供的地名、時間、人名、氣溫；相關乘客只能使用系統提供的名字
- 直接輸出廣播正文，不加標題、引號或說明`;

  const takeoffUser = `【起飛廣播】
乘客：${pax}
出發地：${input.departureLocation}
航線方向：${direction}
${input.localContext ? `\n【當地資訊 · 出發地】\n${buildLocalBlock(input.localContext, 'takeoff')}\n` : ''}
【同組社交】
${buildSocialBlock(input.socialCue)}

請宣布：夜航啟程、出發地、航向（目的地未知，睡多久飛多遠），並自然帶入社交情境
（若為 solo 可寫成「今夜天幕上只有你一人」之類，勿照搬；隊友的地點務必掛隊友的名字）。`;

  const duration = formatDuration(input.flightDurationMinutes);
  const landingUser = `【降落廣播】
乘客：${pax}
出發地：${input.departureLocation}
抵達地：${input.arrivalLocation ?? '未知'}
飛行時長：${duration || '未知'}
航程：${input.estimatedDistanceKm ? `${Math.round(input.estimatedDistanceKm)} 公里` : '未知'}
航線方向：${direction}
${input.localContext ? `\n【當地資訊 · 抵達地】\n${buildLocalBlock(input.localContext, 'landing')}\n` : ''}
【同組社交】
${buildSocialBlock(input.socialCue)}

請宣布：醒來抵達、飛了多久、從哪到哪；必須融入一筆當地文化或天氣（改寫），
並用一句話點出社交情境，合併成一段流暢廣播，勿列點、勿照搬。`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: isTakeoff ? takeoffUser : landingUser },
    ],
    max_tokens: 512,
    temperature: 0.65,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '廣播生成失敗，請重試。';
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
  if (phase === 'takeoff') {
    const wx = localContext?.weatherSummary ? ` ${localContext.localTimeLabel ?? '此刻'}${localContext.weatherSummary}，` : '';
    return `各位乘客，甦醒航班即將自 ${departureLocation} 起飛，航向${direction}。${wx}${pax}，請準備進入夜航。${socialCueText}`;
  }
  const dur = formatDuration(durationMinutes);
  const timeBit = localContext?.localTimeLabel ? `${localContext.localTimeLabel}，` : '本地時間清晨，';
  const wxBit = localContext?.weatherSummary ? `窗外${localContext.weatherSummary}。` : '';
  const cultureBit = localContext?.culture
    ? localContext.culture.split('；')[0]?.split('。')[0] + '。'
    : '走出艙門，向當地人微笑問好吧。';
  return `各位乘客，甦醒航班已平安降落 ${arrivalLocation ?? '目的地'}，${timeBit}${wxBit}${pax} 自 ${departureLocation} 出發，共飛行 ${dur || '一段'}。${cultureBit} ${socialCueText}`;
}
