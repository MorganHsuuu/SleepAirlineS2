import type { Destination } from '../../types';
import {
  getNotionClient, getDbId,
  readTitle, readText, readSelect, readNumber, readCheckbox, readDate,
  wTitle, wText, wSelect, wNumber, wDate,
} from './client';
import { CITIES } from '../../data/cities';

function parseDestination(page: Record<string, unknown>): Destination {
  const props = page.properties as Record<string, unknown>;
  return {
    notionId: page.id as string,
    destinationId: readTitle(props, 'Destination ID'),
    city: readText(props, 'City'),
    country: readText(props, 'Country'),
    displayName: readText(props, 'Display Name'),
    latitude: readNumber(props, 'Latitude') ?? 0,
    longitude: readNumber(props, 'Longitude') ?? 0,
    airportCode: readText(props, 'Airport Code') || null,
    region: readSelect(props, 'Region') ?? '',
    availableForLanding: readCheckbox(props, 'Available for Landing'),
  };
}

export async function getAvailableDestinations(): Promise<Destination[]> {
  // Fall back to local data if Notion is not configured
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DESTINATIONS_DB_ID) {
    return CITIES.filter((c) => c.availableForLanding);
  }

  try {
    const client = getNotionClient();
    const dbId = getDbId('destinations');

    const result = await client.databases.query({
      database_id: dbId,
      filter: { property: 'Available for Landing', checkbox: { equals: true } },
      page_size: 200,
    });

    if (result.results.length === 0) return CITIES.filter((c) => c.availableForLanding);
    return result.results.map((p) => parseDestination(p as unknown as Record<string, unknown>));
  } catch {
    return CITIES.filter((c) => c.availableForLanding);
  }
}

export async function seedDestinations(): Promise<{ seeded: number; skipped: number }> {
  const client = getNotionClient();
  const dbId = getDbId('destinations');
  const now = new Date().toISOString();

  const existing = await client.databases.query({ database_id: dbId, page_size: 200 });
  const existingIds = new Set(
    existing.results.map((p) => {
      const props = (p as Record<string, unknown>).properties as Record<string, unknown>;
      return readTitle(props, 'Destination ID');
    })
  );

  let seeded = 0;
  let skipped = 0;

  for (const city of CITIES) {
    if (existingIds.has(city.destinationId)) { skipped++; continue; }

    await client.pages.create({
      parent: { database_id: dbId },
      properties: {
        'Destination ID': wTitle(city.destinationId),
        'City': wText(city.city),
        'Country': wText(city.country),
        'Display Name': wText(city.displayName),
        'Latitude': wNumber(city.latitude),
        'Longitude': wNumber(city.longitude),
        'Airport Code': wText(city.airportCode),
        'Region': wSelect(city.region),
        'Available for Landing': { checkbox: true },
        'Created At': wDate(now),
        'Updated At': wDate(now),
      },
    });
    seeded++;
  }

  return { seeded, skipped };
}
