import type { Flight, FlightStatus, NarrativeRegion, RouteDirection, DirectionSource, BroadcastStyle, SocialCueType } from '../../types';
import {
  getNotionClient, isNotionConfigured,
  readTitle, readText, readSelect, readNumber, readDate,
  wText, wSelect, wNumber, wDate,
} from './client';
import { resolveDashboardDbId } from './ensure-dashboard';

const mem: Flight[] = [];

function parseFlight(page: Record<string, unknown>): Flight {
  const props = page.properties as Record<string, unknown>;
  const takeoffTime = readDate(props, 'Takeoff Time');
  return {
    notionId: page.id as string,
    flightId: readText(props, 'Flight ID') || readTitle(props, 'Passenger ID'),
    passengerId: readTitle(props, 'Passenger ID'),
    passengerName: readText(props, 'Name'),
    groupId: readSelect(props, 'Group ID') ?? '',
    deviceId: readText(props, 'Device ID'),
    status: (readSelect(props, 'Status') ?? 'not_started') as FlightStatus,
    departureLocation: readText(props, 'Departure Location') || readText(props, 'Current Location'),
    departureLatitude: readNumber(props, 'Departure Latitude') ?? readNumber(props, 'Current Latitude') ?? 0,
    departureLongitude: readNumber(props, 'Departure Longitude') ?? readNumber(props, 'Current Longitude') ?? 0,
    arrivalLocation: readText(props, 'Arrival Location') || null,
    arrivalLatitude: readNumber(props, 'Arrival Latitude'),
    arrivalLongitude: readNumber(props, 'Arrival Longitude'),
    takeoffTime: takeoffTime ?? new Date().toISOString(),
    landingTime: readDate(props, 'Landing Time'),
    flightDurationMinutes: readNumber(props, 'Flight Duration Minutes'),
    estimatedFlightDistanceKm: readNumber(props, 'Estimated Flight Distance KM'),
    flightProgress: readNumber(props, 'Flight Progress') ?? 0,
    narrativeRegion: (readSelect(props, 'Narrative Region') ?? 'departure_clouds') as NarrativeRegion,
    routeDirection: (readSelect(props, 'Route Direction') ?? 'auto') as RouteDirection,
    directionSource: (readSelect(props, 'Direction Source') ?? 'system_auto') as DirectionSource,
    directionNote: readText(props, 'Direction Note') || null,
    captainBroadcastStyle: readSelect(props, 'Captain Broadcast Style') as BroadcastStyle | null,
    captainBroadcast: readText(props, 'Captain Broadcast') || null,
    socialCueType: readSelect(props, 'Social Cue Type') as SocialCueType | null,
    socialCueText: readText(props, 'Social Cue Text') || null,
    relatedPassenger: readText(props, 'Related Passenger') || null,
    createdAt: readDate(props, 'Created At') ?? new Date().toISOString(),
    updatedAt: readDate(props, 'Updated At') ?? new Date().toISOString(),
  };
}

function generateFlightId(passengerId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const suffix = passengerId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return `FL-${suffix}-${ts}`;
}

async function findPassengerPageId(passengerId: string): Promise<string | null> {
  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();
  const result = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Passenger ID', title: { equals: passengerId } },
    page_size: 1,
  });
  return result.results.length > 0 ? (result.results[0] as { id: string }).id : null;
}

export async function createFlight(params: {
  passengerId: string;
  passengerName: string;
  groupId: string;
  deviceId: string;
  departureLocation: string;
  departureLatitude: number;
  departureLongitude: number;
  routeDirection: RouteDirection;
  directionSource: DirectionSource;
  directionNote: string | null;
}): Promise<Flight> {
  const now = new Date().toISOString();
  const flightId = generateFlightId(params.passengerId);

  if (!isNotionConfigured()) {
    for (let i = mem.length - 1; i >= 0; i--) {
      if (mem[i].passengerId === params.passengerId && mem[i].status === 'in_flight') {
        mem.splice(i, 1);
      }
    }
    const notionId = `mem_${params.passengerId}`;
    const f: Flight = {
      notionId,
      flightId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      groupId: params.groupId,
      deviceId: params.deviceId,
      status: 'in_flight',
      departureLocation: params.departureLocation,
      departureLatitude: params.departureLatitude,
      departureLongitude: params.departureLongitude,
      arrivalLocation: null, arrivalLatitude: null, arrivalLongitude: null,
      takeoffTime: now, landingTime: null,
      flightDurationMinutes: null, estimatedFlightDistanceKm: null,
      flightProgress: 0,
      narrativeRegion: 'departure_clouds',
      routeDirection: params.routeDirection,
      directionSource: params.directionSource,
      directionNote: params.directionNote,
      captainBroadcastStyle: null, captainBroadcast: null,
      socialCueType: null, socialCueText: null, relatedPassenger: null,
      createdAt: now, updatedAt: now,
    };
    mem.push(f);
    return f;
  }

  const pageId = await findPassengerPageId(params.passengerId);
  if (!pageId) throw new Error(`找不到乘客 ${params.passengerId}，請先登入。`);

  const client = getNotionClient();
  const properties = {
    'Flight ID': wText(flightId),
    'Name': wText(params.passengerName),
    'Group ID': wSelect(params.groupId),
    'Device ID': wText(params.deviceId),
    'Status': wSelect('in_flight'),
    'Departure Location': wText(params.departureLocation),
    'Departure Latitude': wNumber(params.departureLatitude),
    'Departure Longitude': wNumber(params.departureLongitude),
    'Arrival Location': wText(null),
    'Arrival Latitude': wNumber(null),
    'Arrival Longitude': wNumber(null),
    'Takeoff Time': wDate(now),
    'Landing Time': wDate(null),
    'Flight Duration Minutes': wNumber(null),
    'Estimated Flight Distance KM': wNumber(null),
    'Flight Progress': wNumber(0),
    'Narrative Region': wSelect('departure_clouds'),
    'Route Direction': wSelect(params.routeDirection),
    'Direction Source': wSelect(params.directionSource),
    'Direction Note': wText(params.directionNote),
    'Captain Broadcast Style': wSelect(null),
    'Captain Broadcast': wText(null),
    'Social Cue Type': wSelect(null),
    'Social Cue Text': wText(null),
    'Related Passenger': wText(null),
    'Updated At': wDate(now),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.pages.update({ page_id: pageId, properties: properties as any });
  const page = await client.pages.retrieve({ page_id: pageId });
  return parseFlight(page as unknown as Record<string, unknown>);
}

export async function getActiveFlight(passengerId: string): Promise<Flight | null> {
  if (!isNotionConfigured()) {
    return mem.find((f) => f.passengerId === passengerId && f.status === 'in_flight') ?? null;
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Passenger ID', title: { equals: passengerId } },
        { property: 'Status', select: { equals: 'in_flight' } },
      ],
    },
    page_size: 1,
  });

  if (result.results.length === 0) return null;
  return parseFlight(result.results[0] as unknown as Record<string, unknown>);
}

export async function updateFlight(
  notionId: string,
  updates: Partial<{
    status: FlightStatus;
    arrivalLocation: string;
    arrivalLatitude: number;
    arrivalLongitude: number;
    landingTime: string;
    flightDurationMinutes: number;
    estimatedFlightDistanceKm: number;
    flightProgress: number;
    narrativeRegion: NarrativeRegion;
    captainBroadcastStyle: BroadcastStyle;
    captainBroadcast: string;
    socialCueType: SocialCueType;
    socialCueText: string;
    relatedPassenger: string;
  }>
): Promise<void> {
  if (!isNotionConfigured()) {
    const f = mem.find((x) => x.notionId === notionId);
    if (f) {
      Object.assign(f, updates);
      f.updatedAt = new Date().toISOString();
    }
    return;
  }

  const client = getNotionClient();
  const now = new Date().toISOString();

  const properties: Record<string, unknown> = { 'Updated At': wDate(now) };
  if (updates.status !== undefined) properties['Status'] = wSelect(updates.status);
  if (updates.arrivalLocation !== undefined) {
    properties['Arrival Location'] = wText(updates.arrivalLocation);
    properties['Current Location'] = wText(updates.arrivalLocation);
  }
  if (updates.arrivalLatitude !== undefined) {
    properties['Arrival Latitude'] = wNumber(updates.arrivalLatitude);
    properties['Current Latitude'] = wNumber(updates.arrivalLatitude);
  }
  if (updates.arrivalLongitude !== undefined) {
    properties['Arrival Longitude'] = wNumber(updates.arrivalLongitude);
    properties['Current Longitude'] = wNumber(updates.arrivalLongitude);
  }
  if (updates.landingTime !== undefined) properties['Landing Time'] = wDate(updates.landingTime);
  if (updates.flightDurationMinutes !== undefined) properties['Flight Duration Minutes'] = wNumber(updates.flightDurationMinutes);
  if (updates.estimatedFlightDistanceKm !== undefined) properties['Estimated Flight Distance KM'] = wNumber(updates.estimatedFlightDistanceKm);
  if (updates.flightProgress !== undefined) properties['Flight Progress'] = wNumber(updates.flightProgress);
  if (updates.narrativeRegion !== undefined) properties['Narrative Region'] = wSelect(updates.narrativeRegion);
  if (updates.captainBroadcastStyle !== undefined) properties['Captain Broadcast Style'] = wSelect(updates.captainBroadcastStyle);
  if (updates.captainBroadcast !== undefined) properties['Captain Broadcast'] = wText(updates.captainBroadcast);
  if (updates.socialCueType !== undefined) properties['Social Cue Type'] = wSelect(updates.socialCueType);
  if (updates.socialCueText !== undefined) properties['Social Cue Text'] = wText(updates.socialCueText);
  if (updates.relatedPassenger !== undefined) properties['Related Passenger'] = wText(updates.relatedPassenger);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.pages.update({ page_id: notionId, properties: properties as any });
}

export async function getGroupFlights(
  groupId: string,
  sinceHours: number = 24
): Promise<Flight[]> {
  if (!isNotionConfigured()) {
    const since = Date.now() - sinceHours * 3600 * 1000;
    return mem
      .filter((f) => f.groupId === groupId && new Date(f.takeoffTime).getTime() >= since)
      .sort((a, b) => new Date(b.takeoffTime).getTime() - new Date(a.takeoffTime).getTime());
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Group ID', select: { equals: groupId } },
        { property: 'Takeoff Time', date: { on_or_after: since } },
      ],
    },
    sorts: [{ property: 'Takeoff Time', direction: 'descending' }],
    page_size: 50,
  });

  return result.results
    .map((p) => parseFlight(p as unknown as Record<string, unknown>))
    .filter((f) => f.status === 'in_flight' || f.status === 'landed');
}

export async function getAllActiveFlights(): Promise<Flight[]> {
  if (!isNotionConfigured()) {
    return mem.filter((f) => f.status === 'in_flight');
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Status', select: { equals: 'in_flight' } },
    page_size: 100,
  });

  return result.results.map((p) => parseFlight(p as unknown as Record<string, unknown>));
}
