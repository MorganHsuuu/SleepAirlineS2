import OpenAI from 'openai';

export interface SceneryGenerationResult {
  imageBuffer: Buffer;
  imagePrompt: string;
  contentType: string;
  filename: string;
}

export function buildSceneryPrompt(city: string, country: string, displayName: string): string {
  const place = displayName || `${city}, ${country}`;
  return [
    `View through an airplane cabin window during a gentle morning descent toward ${place}.`,
    `Art style: stylized 3D animated film look — soft Pixar-like cartoon rendering,`,
    `NOT photorealistic, NOT live-action, NOT illustration or watercolor.`,
    `Rounded friendly forms, smooth CGI surfaces, subtle subsurface glow,`,
    `expressive simplified landmarks of ${city} that feel instantly recognizable yet charmingly exaggerated.`,
    `Show iconic architecture and skyline shapes unique to ${place},`,
    `with the warm cultural personality of ${country} in color and mood.`,
    `Golden sunrise light, hopeful just-woke-up arrival feeling;`,
    `bright saturated palette: warm gold, peach, fresh morning-blue sky, soft volumetric haze;`,
    `gentle window-glass reflection at the frame edges — dreamy, luminous, family-friendly.`,
    `No close-up people, no text, no watermark, no logos.`,
  ].join(' ');
}

/** 1024x1024 生成明顯快於 1536x1024；舷窗以 object-fit: cover 裁切，方圖即可。 */
export const SCENERY_IMAGE_SIZE = '1024x1024';

function safeFilename(city: string, flightId: string): string {
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'landing';
  return `landing-${slug}-${flightId.slice(-8)}.jpg`;
}

function isGptImageModel(model: string): boolean {
  return model.startsWith('gpt-image') || model.startsWith('chatgpt-image');
}

export async function generateLandingScenery(
  city: string,
  country: string,
  displayName: string,
  flightId: string
): Promise<SceneryGenerationResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const imagePrompt = buildSceneryPrompt(city, country, displayName);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1-mini';
  const useGptImage = isGptImageModel(model);

  try {
    const response = await client.images.generate(
      useGptImage
        ? {
            model,
            prompt: imagePrompt,
            size: SCENERY_IMAGE_SIZE,
            quality: 'low',
            // jpeg 比 png 小很多，Notion 上傳更快，也比較不容易撞 Vercel 60s 上限
            output_format: 'jpeg',
            n: 1,
          }
        : {
            model,
            prompt: imagePrompt,
            size: SCENERY_IMAGE_SIZE,
            quality: 'standard',
            n: 1,
          }
    );

    const b64 = response.data?.[0]?.b64_json;
    if (b64) {
      return {
        imageBuffer: Buffer.from(b64, 'base64'),
        imagePrompt,
        contentType: useGptImage ? 'image/jpeg' : 'image/png',
        filename: safeFilename(city, flightId),
      };
    }

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      console.error(`[scenery] ${flightId} OpenAI 回傳沒有圖片資料`);
      return null;
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.error(`[scenery] ${flightId} 下載 OpenAI 圖失敗：${imageRes.status}`);
      return null;
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    return {
      imageBuffer,
      imagePrompt,
      contentType: imageRes.headers.get('content-type') ?? 'image/jpeg',
      filename: safeFilename(city, flightId),
    };
  } catch (err) {
    console.error(`[scenery] ${flightId} OpenAI 生圖例外：`, err);
    return null;
  }
}
