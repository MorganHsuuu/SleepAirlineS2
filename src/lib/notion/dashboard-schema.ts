/** 每趟航班一列；舊版「Sleep Airline Dashboard」（一人一列）請保留作 archive。 */
export const DASHBOARD_TITLE = 'Sleep Airline Flight Log';

const GROUP_COLORS = [
  'blue', 'green', 'orange', 'purple', 'pink',
  'red', 'yellow', 'gray', 'brown', 'default',
] as const;

/** Workshop 小隊選項（group_01 … group_15）；Notion Group ID 欄位須同步。 */
export const GROUP_OPTIONS = Array.from({ length: 15 }, (_, i) => ({
  name: `group_${String(i + 1).padStart(2, '0')}`,
  color: GROUP_COLORS[i % GROUP_COLORS.length],
}));

const STATUS_OPTIONS = [
  { name: 'not_started', color: 'gray' as const },
  { name: 'in_flight', color: 'yellow' as const },
  { name: 'landed', color: 'green' as const },
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

/** Notion 表格建議欄位順序（既有表請在 UI 依此拖曳；API 無法自動排序） */
export const DASHBOARD_PROPERTY_ORDER = [
  // 識別
  'Flight ID',
  'Passenger ID',
  'Name',
  'Group ID',
  'Status',
  // 起飛
  'Departure Location',
  'Departure Latitude',
  'Departure Longitude',
  'Takeoff Time',
  'Takeoff Broadcast Style',
  'Takeoff Broadcast',
  'Route Direction',
  'Direction Source',
  'Direction Note',
  // 降落
  'Landing Time',
  'Flight Duration Minutes',
  'Estimated Flight Distance KM',
  'Arrival Location',
  'Arrival Latitude',
  'Arrival Longitude',
  'Captain Broadcast Style',
  'Captain Broadcast',
  // 社交
  'Social Cue Type',
  'Social Cue Text',
  'Related Passenger',
  // 系統
  'Created At',
  'Updated At',
] as const;

export function getDashboardProperties() {
  return {
    // ── 識別 ──
    'Flight ID': { title: {} },
    'Passenger ID': { rich_text: {} },
    'Name': { rich_text: {} },
    'Group ID': { select: { options: GROUP_OPTIONS } },
    'Status': { select: { options: STATUS_OPTIONS } },
    // ── 起飛 ──
    'Departure Location': { rich_text: {} },
    'Departure Latitude': { number: { format: 'number' } },
    'Departure Longitude': { number: { format: 'number' } },
    'Takeoff Time': { date: {} },
    'Takeoff Broadcast Style': { select: { options: BROADCAST_STYLE_OPTIONS } },
    'Takeoff Broadcast': { rich_text: {} },
    'Route Direction': { select: { options: ROUTE_DIRECTION_OPTIONS } },
    'Direction Source': { select: { options: DIRECTION_SOURCE_OPTIONS } },
    'Direction Note': { rich_text: {} },
    // ── 降落 ──
    'Landing Time': { date: {} },
    'Flight Duration Minutes': { number: { format: 'number' } },
    'Estimated Flight Distance KM': { number: { format: 'number' } },
    'Arrival Location': { rich_text: {} },
    'Arrival Latitude': { number: { format: 'number' } },
    'Arrival Longitude': { number: { format: 'number' } },
    'Captain Broadcast Style': { select: { options: BROADCAST_STYLE_OPTIONS } },
    'Captain Broadcast': { rich_text: {} },
    // ── 社交 ──
    'Social Cue Type': { select: { options: SOCIAL_CUE_OPTIONS } },
    'Social Cue Text': { rich_text: {} },
    'Related Passenger': { rich_text: {} },
    // ── 系統 ──
    'Created At': { date: {} },
    'Updated At': { date: {} },
  };
}

export const DEFAULT_PARENT_PAGE_ID = '388a7f1b413c8015824ff6fb8bc1d65b';

export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '');
}
