/** 每趟航班一列；舊版「Sleep Airline Dashboard」（一人一列）請保留作 archive。 */
export const DASHBOARD_TITLE = 'Sleep Airline Flight Log';

const GROUP_OPTIONS = [
  { name: 'group_01', color: 'blue' as const },
  { name: 'group_02', color: 'green' as const },
  { name: 'group_03', color: 'orange' as const },
  { name: 'group_04', color: 'purple' as const },
  { name: 'group_05', color: 'pink' as const },
];

const STATUS_OPTIONS = [
  { name: 'not_started', color: 'gray' as const },
  { name: 'in_flight', color: 'yellow' as const },
  { name: 'landed', color: 'green' as const },
];

const NARRATIVE_REGION_OPTIONS = [
  { name: 'departure_clouds', color: 'gray' as const },
  { name: 'pacific_drift', color: 'blue' as const },
  { name: 'deep_night_current', color: 'purple' as const },
  { name: 'dawn_corridor', color: 'orange' as const },
  { name: 'arrival_harbor', color: 'green' as const },
];

const ROUTE_DIRECTION_OPTIONS = [
  'auto', 'eastbound', 'westbound', 'northbound', 'southbound',
  'northeast', 'northwest', 'southeast', 'southwest', 'circular', 'unknown',
].map((name) => ({ name, color: 'default' as const }));

const DIRECTION_SOURCE_OPTIONS = [
  'system_auto', 'participant_design', 'mood_input', 'weather_input',
  'team_signal', 'physical_interaction', 'random_card', 'future_body_data',
].map((name, i) => ({ name, color: (['gray', 'blue', 'pink', 'purple', 'green', 'orange', 'yellow', 'red'] as const)[i] }));

const BROADCAST_STYLE_OPTIONS = [
  'formal_captain', 'poetic', 'playful', 'flight_attendant', 'radio_host', 'custom',
].map((name, i) => ({ name, color: (['blue', 'purple', 'yellow', 'pink', 'orange', 'gray'] as const)[i] }));

const SOCIAL_CUE_OPTIONS = [
  'same_sky', 'same_region', 'nearby_region', 'relay_flight',
  'early_landing', 'late_landing', 'solo',
].map((name, i) => ({ name, color: (['blue', 'purple', 'green', 'orange', 'yellow', 'pink', 'gray'] as const)[i] }));

export function getDashboardProperties() {
  return {
    'Flight ID': { title: {} },
    'Passenger ID': { rich_text: {} },
    'Name': { rich_text: {} },
    'Group ID': { select: { options: GROUP_OPTIONS } },
    'Device ID': { rich_text: {} },
    'Status': { select: { options: STATUS_OPTIONS } },
    'Departure Location': { rich_text: {} },
    'Departure Latitude': { number: { format: 'number' } },
    'Departure Longitude': { number: { format: 'number' } },
    'Arrival Location': { rich_text: {} },
    'Arrival Latitude': { number: { format: 'number' } },
    'Arrival Longitude': { number: { format: 'number' } },
    'Takeoff Time': { date: {} },
    'Landing Time': { date: {} },
    'Flight Duration Minutes': { number: { format: 'number' } },
    'Estimated Flight Distance KM': { number: { format: 'number' } },
    'Flight Progress': { number: { format: 'number' } },
    'Narrative Region': { select: { options: NARRATIVE_REGION_OPTIONS } },
    'Route Direction': { select: { options: ROUTE_DIRECTION_OPTIONS } },
    'Direction Source': { select: { options: DIRECTION_SOURCE_OPTIONS } },
    'Direction Note': { rich_text: {} },
    'Takeoff Broadcast Style': { select: { options: BROADCAST_STYLE_OPTIONS } },
    'Takeoff Broadcast': { rich_text: {} },
    'Captain Broadcast Style': { select: { options: BROADCAST_STYLE_OPTIONS } },
    'Captain Broadcast': { rich_text: {} },
    'Social Cue Type': { select: { options: SOCIAL_CUE_OPTIONS } },
    'Social Cue Text': { rich_text: {} },
    'Related Passenger': { rich_text: {} },
    'Created At': { date: {} },
    'Updated At': { date: {} },
  };
}

export const DEFAULT_PARENT_PAGE_ID = '388a7f1b413c8015824ff6fb8bc1d65b';

export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '');
}
