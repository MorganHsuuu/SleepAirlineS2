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
    `A breathtaking scenic photograph of a famous landmark or natural landscape in ${country},`,
    `representing the region around ${city}.`,
    'Golden hour light, cinematic travel photography, wide angle, atmospheric,',
    'no people, no text, no watermark, no logos.',
  ].join(' ');
}

function safeFilename(city: string, flightId: string): string {
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'landing';
  return `landing-${slug}-${flightId.slice(-8)}.png`;
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
  const model = process.env.OPENAI_IMAGE_MODEL ?? 'dall-e-3';

  const response = await client.images.generate({
    model,
    prompt: imagePrompt,
    size: '1024x1024',
    quality: 'standard',
    n: 1,
  });

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
