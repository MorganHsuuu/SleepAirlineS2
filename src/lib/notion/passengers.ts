import type { Passenger, PassengerStatus } from '../../types';
import {
  getNotionClient, getDbId, isNotionConfigured,
  readTitle, readText, readSelect, readNumber, readDate,
  wTitle, wText, wSelect, wNumber, wDate,
} from './client';

const DEFAULT_LOCATION = 'Taipei, Taiwan';
const DEFAULT_LAT = 25.0330;
const DEFAULT_LNG = 121.5654;

// ── In-memory fallback ────────────────────────────────────────────────────────

const mem = new Map<string, Passenger>();

function parsePassenger(page: Record<string, unknown>): Passenger {
  const props = page.properties as Record<string, unknown>;
  return {
    notionId: page.id as string,
    passengerId: readTitle(props, 'Passenger ID'),
    name: readText(props, 'Name'),
    groupId: readSelect(props, 'Group ID') ?? '',
    deviceId: readText(props, 'Device ID'),
    currentLocation: readText(props, 'Current Location') || DEFAULT_LOCATION,
    currentLatitude: readNumber(props, 'Current Latitude') ?? DEFAULT_LAT,
    currentLongitude: readNumber(props, 'Current Longitude') ?? DEFAULT_LNG,
    lastFlightId: readText(props, 'Last Flight ID') || null,
    status: (readSelect(props, 'Status') ?? 'not_started') as PassengerStatus,
    createdAt: readDate(props, 'Created At') ?? new Date().toISOString(),
    updatedAt: readDate(props, 'Updated At') ?? new Date().toISOString(),
  };
}

export async function getOrCreatePassenger(
  passengerId: string,
  name: string,
  groupId: string,
  deviceId: string = 'web'
): Promise<{ passenger: Passenger; created: boolean }> {
  if (!isNotionConfigured()) {
    const existing = mem.get(passengerId);
    if (existing) return { passenger: existing, created: false };
    const now = new Date().toISOString();
    const p: Passenger = {
      notionId: `mem_${passengerId}`,
      passengerId, name, groupId, deviceId,
      currentLocation: DEFAULT_LOCATION,
      currentLatitude: DEFAULT_LAT,
      currentLongitude: DEFAULT_LNG,
      lastFlightId: null,
      status: 'not_started',
      createdAt: now, updatedAt: now,
    };
    mem.set(passengerId, p);
    return { passenger: p, created: true };
  }

  const client = getNotionClient();
  const dbId = getDbId('passengers');
  const now = new Date().toISOString();

  const existing = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Passenger ID', title: { equals: passengerId } },
    page_size: 1,
  });

  if (existing.results.length > 0) {
    return {
      passenger: parsePassenger(existing.results[0] as Record<string, unknown>),
      created: false,
    };
  }

  const page = await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      'Passenger ID': wTitle(passengerId),
      'Name': wText(name),
      'Group ID': wSelect(groupId),
      'Device ID': wText(deviceId),
      'Current Location': wText(DEFAULT_LOCATION),
      'Current Latitude': wNumber(DEFAULT_LAT),
      'Current Longitude': wNumber(DEFAULT_LNG),
      'Last Flight ID': wText(null),
      'Status': wSelect('not_started'),
      'Created At': wDate(now),
      'Updated At': wDate(now),
    },
  });

  return {
    passenger: parsePassenger(page as unknown as Record<string, unknown>),
    created: true,
  };
}

export async function updatePassengerStatus(
  notionId: string,
  updates: {
    status?: PassengerStatus;
    currentLocation?: string;
    currentLatitude?: number;
    currentLongitude?: number;
    lastFlightId?: string;
  }
): Promise<void> {
  if (!isNotionConfigured()) {
    for (const p of mem.values()) {
      if (p.notionId === notionId) {
        if (updates.status !== undefined) p.status = updates.status;
        if (updates.currentLocation !== undefined) p.currentLocation = updates.currentLocation;
        if (updates.currentLatitude !== undefined) p.currentLatitude = updates.currentLatitude;
        if (updates.currentLongitude !== undefined) p.currentLongitude = updates.currentLongitude;
        if (updates.lastFlightId !== undefined) p.lastFlightId = updates.lastFlightId;
        p.updatedAt = new Date().toISOString();
        break;
      }
    }
    return;
  }

  const client = getNotionClient();
  const now = new Date().toISOString();

  const properties: Record<string, unknown> = { 'Updated At': wDate(now) };
  if (updates.status !== undefined) properties['Status'] = wSelect(updates.status);
  if (updates.currentLocation !== undefined) properties['Current Location'] = wText(updates.currentLocation);
  if (updates.currentLatitude !== undefined) properties['Current Latitude'] = wNumber(updates.currentLatitude);
  if (updates.currentLongitude !== undefined) properties['Current Longitude'] = wNumber(updates.currentLongitude);
  if (updates.lastFlightId !== undefined) properties['Last Flight ID'] = wText(updates.lastFlightId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.pages.update({ page_id: notionId, properties: properties as any });
}
