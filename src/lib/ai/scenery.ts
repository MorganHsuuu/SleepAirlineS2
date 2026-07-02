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
    `Golden sunrise light breaking over the city — a hopeful, just-woke-up feeling of arrival.`,
    `Feature the most iconic, instantly recognizable landmarks and skyline of ${city}:`,
    `famous architecture, distinctive local rooftops and streets that could only be ${place},`,
    `rich with the authentic cultural character of ${country}.`,
    `Bright daybreak palette: warm gold, soft peach, fresh morning-blue sky, thin luminous haze;`,
    `subtle window-glass reflection at the frame edges — cinematic, dreamy yet luminous.`,
    `No close-up people, no text, no watermark, no logos.`,
  ].join(' ');
}

/** Landscape aspect ratio suits the night-window composition. */
export const SCENERY_IMAGE_SIZE = '1536x1024';

function safeFilename(city: string, flightId: string): string {
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'landing';
  return `landing-${slug}-${flightId.slice(-8)}.png`;
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

  const response = await client.images.generate(
    isGptImageModel(model)
      ? {
          model,
          prompt: imagePrompt,
          size: SCENERY_IMAGE_SIZE,
          quality: 'medium',
          output_format: 'png',
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

  const b64 = response.data[0]?.b64_json;
  if (b64) {
    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      imagePrompt,
      contentType: 'image/png',
      filename: safeFilename(city, flightId),
    };
  }

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) return null;

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) return null;
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  return {
    imageBuffer,
    imagePrompt,
    contentType: imageRes.headers.get('content-type') ?? 'image/png',
    filename: safeFilename(city, flightId),
  };
}
