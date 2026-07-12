import OpenAI from 'openai';
import type { SocialCue } from '../../types';

/**
 * Social Takeaway：一句可以拿去跟隊友接話的社交短句。
 * 不是完整機長廣播——是「昨晚我和隊友之間發生了什麼」的一句話版本，
 * 顯示在起飛／降落畫面（小隊回聲），之後也可用於 TTS 或 Reply Card。
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

/** AI 不可用時的規則式短句：依 cueType 給一句可接話的話 */
export function fallbackSocialTakeaway(input: SocialTakeawayInput): string {
  const name = input.socialCue.relatedPassenger?.trim() || '一位隊友';
  switch (input.socialCue.cueType) {
    case 'solo':
      return input.phase === 'takeoff'
        ? '今晚小隊雷達很安靜，你先起飛。'
        : '今晚你完成了一趟安靜的個人航班。';
    case 'teammate_departure':
      return `${name} 已經起飛，小隊夜航開始了。`;
    case 'teammate_in_sky':
      return `${name} 還在飛，你不是唯一醒著的人。`;
    case 'teammate_arrival':
      return `${name} 已經降落，先替小隊探了路。`;
    case 'fresh_arrival':
      return `${name} 剛剛降落，小隊雷達亮了一下。`;
    case 'parallel_heading':
      return `你和 ${name} 昨晚真的往同個方向飛了。`;
    case 'same_departure':
      return `你和 ${name} 從同一座城市起飛。`;
    case 'heading_contrast':
      return `你和 ${name} 分頭飛，夜空剛好被拉開。`;
    case 'squad_in_sky':
      return '今晚小隊雷達很熱鬧。';
    case 'first_of_night':
      return '你是今晚小隊第一班起飛的航班。';
    case 'relay_flight':
      return `你降落後，${name} 繼續替小隊夜航。`;
    case 'early_landing':
      return `${name} 比你早降落，先抵達清晨。`;
    case 'late_landing':
      return `${name} 在你之後也完成降落。`;
    case 'route_convergence':
      return `你和 ${name} 的航線比想像中更靠近。`;
    default:
      return '小隊雷達記下了今晚的一段航程。';
  }
}

/** 去掉模型偶爾加上的引號、標題、換行，只留一句 */
function cleanTakeaway(raw: string): string {
  return raw
    .replace(/^["'「『”]+|["'」『』”]+$/g, '')
    .replace(/^(小隊回聲|Social Takeaway)[：:]\s*/i, '')
    .split('\n')[0]
    .trim();
}

const SYSTEM_PROMPT = `你是「甦醒航班 Sleep Airline」的社交語音短句撰寫者。
你的任務不是寫完整機長廣播，而是根據航班資料生成一句可以讓使用者拿去跟同組朋友接話的短句。

設計目標：
- 把睡眠提醒轉化為飛行語言
- 把監督感轉化為玩笑式陪伴
- 把小隊狀態轉化為一句可以被分享、回應、截圖或傳給朋友的話
- 讓句子聽起來像 Sleep Airline 世界裡自然會出現的話，而不是健康 App 通知

語氣：
- 繁體中文
- 口語、短、清楚、有一點可愛或玩笑
- 不要過度詩意
- 不要像客服、不要像健康建議、不要像任務系統
- 可以輕微撒嬌、玩笑、邀請，但不能責備
- 像朋友之間可以講的航班語言

長度：
- 12–32 字
- 最多一句
- 不要列點
- 不要加標題、引號或說明

禁止：
- 禁止說「你應該早睡」「請改善睡眠」「睡眠品質」
- 禁止評分、排名、達標、失敗
- 禁止責備沒起飛或晚睡的人
- 禁止編造未提供的人名、地名、時間
- 禁止把飛行中的隊友說成已降落
- 禁止把已降落的隊友說成還在飛
- 禁止說所有隊友都如何，除非資料明確提供多人狀態
- 禁止過度感性或太文青
- 禁止使用「夢想」「宇宙」「靈魂」這類太抽象的字眼

社交語言方向：
- 如果是 solo，不要強調孤單，可以說「今晚小隊雷達很安靜」
- 如果有人還在飛，要呈現陪伴感，例如「A 還在飛，你不是唯一醒著的人」
- 如果有人已降落，可以說「A 先替小隊探了路」
- 如果同向飛行，可以說「你們昨晚真的一起往東飛了」
- 如果航線接近，可以說「你和 A 的航線比想像中更靠近」
- 如果接力，可以說「你降落後，A 繼續替小隊夜航」
- 如果沒有人或資訊不足，就生成一句溫和的個人航班句`;

export async function generateSocialTakeaway(input: SocialTakeawayInput): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackSocialTakeaway(input);
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

【同組社交】
類型：${input.socialCue.cueType}
提示：${input.socialCue.cueText}
相關乘客：${input.socialCue.relatedPassenger ?? '無'}

請生成一句 Social Takeaway。`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 80,
      temperature: 0.9,
    });

    const text = cleanTakeaway(completion.choices[0]?.message?.content ?? '');
    return text.length >= 6 ? text : fallbackSocialTakeaway(input);
  } catch {
    return fallbackSocialTakeaway(input);
  }
}
