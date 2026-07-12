import OpenAI from 'openai';
import type { SocialCue } from '../../types';

/**
 * Social Takeaway：可以拿去跟隊友接話的社交短句。
 * primary cue 一句；人數多時可再加一句 group summary，最多兩句。
 * 不是完整機長廣播——顯示在起飛／降落畫面（小隊回聲）。
 */
export interface SocialTakeawayInput {
  phase: 'takeoff' | 'landing';
  passengerName: string;
  socialCue: SocialCue;
  routeDirection: string;
  departureLocation: string;
  arrivalLocation?: string | null;
  flightDurationMinutes?: number | null;
  estimatedDistanceKm?: number | null;
  groupSummary?: string | null;
}

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

function endSentence(text: string): string {
  const trimmed = text.trim().replace(/[。．.！!？?]+$/u, '');
  return trimmed ? `${trimmed}。` : '';
}

/** primary + optional group summary，最多兩句 */
export function composeSocialTakeaway(primary: string, groupSummary?: string | null): string {
  const first = endSentence(primary);
  const second = endSentence(groupSummary ?? '');
  if (!first) return second;
  if (!second) return first;
  return `${first}${second}`;
}

/** AI 不可用時的規則式短句：依 cueType 給一句可接話的話 */
export function fallbackSocialTakeaway(input: SocialTakeawayInput): string {
  const name = input.socialCue.relatedPassenger?.trim() || '一位隊友';
  let primary = '';
  switch (input.socialCue.cueType) {
    case 'solo':
      primary = input.phase === 'takeoff'
        ? '今晚小隊雷達很安靜，你先起飛。'
        : '今晚你完成了一趟安靜的個人航班。';
      break;
    case 'teammate_departure':
      primary = `${name} 已經起飛，小隊夜航開始了。`;
      break;
    case 'teammate_in_sky':
      primary = `${name} 還在飛，你不是唯一醒著的人。`;
      break;
    case 'teammate_arrival':
      primary = `${name} 已經降落，先替小隊探了路。`;
      break;
    case 'fresh_arrival':
      primary = `${name} 剛剛降落，小隊雷達亮了一下。`;
      break;
    case 'parallel_heading':
      primary = `你和 ${name} 昨晚真的往同個方向飛了。`;
      break;
    case 'same_departure':
      primary = `你和 ${name} 從同一座城市起飛。`;
      break;
    case 'heading_contrast':
      primary = `你和 ${name} 分頭飛，夜空剛好被拉開。`;
      break;
    case 'squad_in_sky':
      primary = '今晚小隊雷達很熱鬧。';
      break;
    case 'first_of_night':
      primary = '你是今晚小隊第一班起飛的航班。';
      break;
    case 'relay_flight':
      primary = `你降落後，${name} 繼續替小隊夜航。`;
      break;
    case 'early_landing':
      primary = `${name} 比你早降落，先抵達清晨。`;
      break;
    case 'late_landing':
      primary = `${name} 在你之後也完成降落。`;
      break;
    case 'route_convergence':
      primary = `你和 ${name} 的航線比想像中更靠近。`;
      break;
    default:
      primary = '小隊雷達記下了今晚的一段航程。';
  }

  const groupSummary = input.groupSummary ?? input.socialCue.groupSummary ?? null;
  return composeSocialTakeaway(primary, groupSummary);
}

/** 去掉模型偶爾加上的引號、標題；保留最多兩句 */
function cleanTakeaway(raw: string): string {
  const cleaned = raw
    .replace(/^["'「『”]+|["'」『』”]+$/g, '')
    .replace(/^(小隊回聲|Social Takeaway)[：:]\s*/i, '')
    .trim();
  const parts = cleaned
    .split(/(?<=[。！？])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  return parts.join('');
}

const SYSTEM_PROMPT = `你是「甦醒航班 Sleep Airline」的社交語音短句撰寫者。
你的任務不是寫完整機長廣播，而是根據「一則主要雷達訊號」生成可拿去跟同組朋友接話的短句。

設計目標：
- 像「小隊雷達掃到一則訊號」，不是完整監控報告
- 每次只講一則主要個人／事件訊號
- 若有小隊氛圍句，最多再補一句整體感，不要列出所有人

語氣：
- 繁體中文
- 口語、短、清楚、有一點可愛或玩笑
- 不要過度詩意
- 不要像客服、不要像健康建議、不要像任務系統

長度：
- 主要訊號 12–32 字
- 若提供【小隊氛圍】，輸出最多兩句：第一句改寫主要訊號，第二句改寫小隊氛圍
- 若沒有【小隊氛圍】，只輸出一句
- 不要列點、不要加標題、引號或說明

禁止：
- 禁止說「你應該早睡」「請改善睡眠」「睡眠品質」
- 禁止評分、排名、達標、失敗、比較誰睡比較久
- 禁止列出所有隊友的睡眠或飛行狀態
- 禁止責備沒起飛或晚睡的人
- 禁止編造未提供的人名、地名、時間
- 禁止把飛行中的隊友說成已降落
- 禁止把已降落的隊友說成還在飛
- 禁止把單一訊號擴寫成全員監控報告`;

export async function generateSocialTakeaway(input: SocialTakeawayInput): Promise<string> {
  const groupSummary = input.groupSummary ?? input.socialCue.groupSummary ?? null;
  if (!process.env.OPENAI_API_KEY) {
    return fallbackSocialTakeaway({ ...input, groupSummary });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const direction = DIRECTION_LABEL[input.routeDirection] ?? input.routeDirection;

  const userPrompt = `【階段】
${input.phase}

【乘客】
${input.passengerName}

【本班資料】
出發地：${input.departureLocation}
抵達地：${input.arrivalLocation ?? '未知'}
航向：${direction}
飛行時長：${input.flightDurationMinutes ?? '未知'}
航程公里：${input.estimatedDistanceKm ? Math.round(input.estimatedDistanceKm) : '未知'}

【主要雷達訊號】
類型：${input.socialCue.cueType}
提示：${input.socialCue.cueText}
相關乘客：${input.socialCue.relatedPassenger ?? '無'}
${groupSummary ? `\n【小隊氛圍】\n${groupSummary}\n` : ''}
請生成 Social Takeaway（${groupSummary ? '最多兩句' : '一句'}）。`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: groupSummary ? 120 : 80,
      temperature: 0.9,
    });

    const text = cleanTakeaway(completion.choices[0]?.message?.content ?? '');
    if (text.length < 6) {
      return fallbackSocialTakeaway({ ...input, groupSummary });
    }
    if (!groupSummary) return endSentence(text);

    const parts = text.split(/(?<=[。！？])/).map((part) => part.trim()).filter(Boolean);
    return composeSocialTakeaway(parts[0] ?? text, parts[1] ?? groupSummary);
  } catch {
    return fallbackSocialTakeaway({ ...input, groupSummary });
  }
}
