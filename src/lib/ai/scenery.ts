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
    `The scene celebrates what makes ${city} unmistakable: its most iconic architecture and`,
    `landmark silhouettes, traditional building styles and cultural motifs of ${country},`,
    `and the surrounding natural landscape — mountains, coastline, rivers, fields or skyline seen from above.`,
    `Rounded friendly forms, smooth CGI surfaces, subtle subsurface glow,`,
    `charmingly exaggerated landmarks that feel instantly recognizable.`,
    `Golden sunrise light, hopeful just-woke-up arrival feeling;`,
    `bright saturated palette: warm gold, peach, fresh morning-blue sky, soft volumetric haze;`,
    `gentle window-glass reflection at the frame edges — dreamy, luminous, family-friendly.`,
    `Absolutely no text of any kind anywhere in the image: no signs, billboards, banners,`,
    `storefront lettering, street markings, no letters, numbers or writing in any language.`,
    `No close-up people, no watermark, no logos.`,
  ].join(' ');
}

/** 1024x1024 生成明顯快於 1536x1024；舷窗以 object-fit: cover 裁切，方圖即可。 */
export const SCENERY_IMAGE_SIZE = '1024x1024';

/**
 * gpt-image 系列的生圖品質，可用 OPENAI_IMAGE_QUALITY 環境變數調整（low / medium / high）。
 * 生圖已改為降落後由伺服器背景完成，不趕過場時間，medium 的細節值得多等的十幾秒。
 */
type GptImageQuality = 'low' | 'medium' | 'high';
function resolveImageQuality(): GptImageQuality {
  const q = process.env.OPENAI_IMAGE_QUALITY?.toLowerCase();
  return q === 'low' || q === 'medium' || q === 'high' ? q : 'medium';
}

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
            quality: resolveImageQuality(),
            // jpeg 比 png 小很多，Notion 上傳更快
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
