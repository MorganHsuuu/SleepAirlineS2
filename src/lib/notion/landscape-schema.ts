import { normalizeNotionId, DEFAULT_PARENT_PAGE_ID } from './dashboard-schema';

export { normalizeNotionId, DEFAULT_PARENT_PAGE_ID };

export const LANDSCAPE_DB_TITLE = 'Sleep Airline Landing Scenery';

const GROUP_OPTIONS = [
  { name: 'group_01', color: 'blue' as const },
  { name: 'group_02', color: 'green' as const },
  { name: 'group_03', color: 'orange' as const },
  { name: 'group_04', color: 'purple' as const },
  { name: 'group_05', color: 'pink' as const },
];

export function getLandscapeProperties() {
  return {
    'Entry ID': { title: {} },
    'Flight ID': { rich_text: {} },
    'Passenger ID': { rich_text: {} },
    'Name': { rich_text: {} },
    'Group ID': { select: { options: GROUP_OPTIONS } },
    'Arrival Location': { rich_text: {} },
    'Country': { rich_text: {} },
    'Image': { files: {} },
    'Image URL': { url: {} },
    'Image Prompt': { rich_text: {} },
    'Landing Time': { date: {} },
    'Created At': { date: {} },
  };
}
