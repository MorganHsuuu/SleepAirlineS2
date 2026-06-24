import OpenAI from 'openai';
import type { BroadcastStyle, NarrativeRegion } from '../../types';
import type { SocialCue } from '../../types';
import { REGION_DISPLAY } from '../flight/region';

const STYLE_DESCRIPTIONS: Record<BroadcastStyle, string> = {
  formal_captain: '你是一位沉穩、專業的航空公司機長，廣播語氣正式且令人安心。',
  poetic: '你是一位充滿詩意的機長，廣播語言如散文詩，充滿意象與哲思。',
  playful: '你是一位幽默、輕鬆的機長，廣播充滿溫暖的玩笑與親切感。',
  flight_attendant: '你是一位親切的空服員，廣播語氣溫柔、體貼，充滿關懷。',
  radio_host: '你是一位深夜電台主持人，廣播如同夜間節目，娓娓道來旅客的夜行故事。',
  custom: '你是甦醒航班的廣播員，以你認為最適合的語氣傳達這趟飛行的故事。',
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
}

export async function generateCaptainBroadcast(input: BroadcastInput): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 尚未設定。');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const isTakeoff = input.phase === 'takeoff';

  const arrivalText = input.arrivalLocation
    ? `已抵達：${input.arrivalLocation}`
    : `目前空域：${REGION_DISPLAY[input.narrativeRegion]}（飛行進度 ${Math.round(input.flightProgress)}%）`;

  const durationText = input.flightDurationMinutes
    ? `${input.flightDurationMinutes} 分鐘（約 ${Math.floor(input.flightDurationMinutes / 60)} 小時 ${input.flightDurationMinutes % 60} 分鐘）`
    : isTakeoff ? '剛起飛，夜間航程開始' : `進度 ${Math.round(input.flightProgress)}%`;

  const phaseHint = isTakeoff
    ? '這是起飛廣播：歡迎登機、宣布自出發地啟航、說明航線方向與即將進入的空域，語氣溫暖且令人安心。不得提及抵達地（尚未降落）。'
    : '這是降落廣播：歡迎抵達、總結飛行時長與航程，語氣溫暖且令人安心。';

  const systemPrompt = `你是甦醒航班的廣播系統。${STYLE_DESCRIPTIONS[input.style]}

${phaseHint}

規則：
- 使用繁體中文
- 廣播長度控制在 100-150 字
- 必須包含：乘客姓名、出發地${isTakeoff ? '' : '、抵達地或目前空域'}、${isTakeoff ? '航線方向與目前空域' : '飛行時長'}、航線方向、社交提示
- 不得自行編造系統未提供的目的地、時長或人際關係
- 直接輸出廣播內容，不加任何前綴或說明`;

  const userPrompt = `請根據以下資料生成${isTakeoff ? '起飛' : '降落'}機長廣播：

乘客姓名：${input.passengerName}
出發地：${input.departureLocation}
${isTakeoff ? `目前空域：${REGION_DISPLAY[input.narrativeRegion]}` : arrivalText}
${isTakeoff ? '' : `飛行時長：${durationText}\n估算距離：${input.estimatedDistanceKm ? `${Math.round(input.estimatedDistanceKm)} km` : '計算中'}`}
航線方向：${input.routeDirection}
社交提示（必須寫入廣播）：${input.socialCue.cueText}`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '廣播生成失敗，請重試。';
}
