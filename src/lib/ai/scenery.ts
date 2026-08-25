import OpenAI from 'openai';

export interface SceneryGenerationResult {
  imageBuffer: Buffer;
  imagePrompt: string;
  contentType: string;
  filename: string;
}

export const DEFAULT_SCENERY_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_SCENERY_IMAGE_QUALITY = 'low';

export function buildSceneryPrompt(city: string, country: string, displayName: string): string {
  const place = displayName || `${city}, ${country}`;
  return [
    `Create a premium dimensional travel postcard of ${place}, seen during a gentle airplane descent.`,
    `The destination must be instantly recognizable without relying on text.`,
    `Use a polished handcrafted 3D relief / miniature-diorama aesthetic: tactile depth, refined forms,`,
    `cinematic composition and believable materials, but not photorealistic and not a generic toy scene.`,
    `Build the image from the real visual DNA of ${city}, ${country}:`,
    `accurate terrain and coastline or river pattern; one or two landmarks only if they truly exist there;`,
    `authentic local architecture, street or roof materials, native vegetation and region-appropriate weather.`,
    `Use a destination-specific color palette derived from the local landscape, craft traditions,`,
    `building materials and natural light. Do not impose a universal orange-and-blue travel palette.`,
    `Let the local colors dominate: preserve the characteristic mineral, botanical, coastal, desert,`,
    `tropical, polar or urban hues that distinguish this place from every other destination.`,
    `The place name may be provided in another language, but geography and culture must follow the actual location.`,
    `Never substitute East-Asian motifs unless ${city}, ${country} genuinely calls for them.`,
    `For nature-led destinations, prioritize the true landforms and ecosystem and do not invent a city.`,
    `Show soft first light and a calm just-awakened arrival mood while keeping the destination's own palette intact.`,
    `A very subtle airplane-window reflection may appear at the outer edge; keep the scenery large and unobstructed.`,
    `Absolutely no text of any kind anywhere in the image: no signs, billboards, banners,`,
    `storefront lettering, street markings, no letters, numbers or writing in any language.`,
    `No invented landmarks, no close-up people, no watermark, no logos.`,
  ].join(' ');
}

/** 1024x1024 生成明顯快於 1536x1024；舷窗以 object-fit: cover 裁切，方圖即可。 */
export const SCENERY_IMAGE_SIZE = '1024x1024';

/**
 * gpt-image 系列的生圖品質，可用 OPENAI_IMAGE_QUALITY 環境變數調整（low / medium / high）。
 * gpt-image-2 的 low 適合即時降落圖：速度快，首張品質也優於 mini 草稿模型。
 */
type GptImageQuality = 'low' | 'medium' | 'high';
function resolveImageQuality(): GptImageQuality {
  const q = process.env.OPENAI_IMAGE_QUALITY?.toLowerCase();
  return q === 'low' || q === 'medium' || q === 'high' ? q : DEFAULT_SCENERY_IMAGE_QUALITY;
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
  const model = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_SCENERY_IMAGE_MODEL;
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
