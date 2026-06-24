/**
 * Sleep Airline — Notion Database Setup Script
 *
 * Usage:
 *   npx tsx scripts/setup-notion.ts
 *
 * Requires NOTION_API_KEY and NOTION_PARENT_PAGE_ID in .env.local
 *
 * Creates:
 *   1. Passengers database
 *   2. Flights database
 *   3. Destinations database
 *
 * Outputs the three Database IDs → copy to .env.local
 */

import { Client } from '@notionhq/client';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (tsx doesn't auto-load it)
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found. Please create it first.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

loadEnv();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID ?? '388a7f1b413c8015824ff6fb8bc1d65b';

if (!NOTION_API_KEY) {
  console.error('❌ NOTION_API_KEY not set in .env.local');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

async function createPassengersDB() {
  console.log('\n📋 Creating Passengers database...');
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: 'Passengers' } }],
    properties: {
      'Passenger ID': { title: {} },
      'Name': { rich_text: {} },
      'Group ID': {
        select: {
          options: [
            { name: 'group_01', color: 'blue' },
            { name: 'group_02', color: 'green' },
            { name: 'group_03', color: 'orange' },
            { name: 'group_04', color: 'purple' },
            { name: 'group_05', color: 'pink' },
          ],
        },
      },
      'Device ID': { rich_text: {} },
      'Current Location': { rich_text: {} },
      'Current Latitude': { number: { format: 'number' } },
      'Current Longitude': { number: { format: 'number' } },
      'Last Flight ID': { rich_text: {} },
      'Status': {
        select: {
          options: [
            { name: 'not_started', color: 'gray' },
            { name: 'in_flight', color: 'yellow' },
            { name: 'landed', color: 'green' },
          ],
        },
      },
      'Created At': { date: {} },
      'Updated At': { date: {} },
    },
  });
  console.log(`✅ Passengers DB created: ${db.id}`);
  return db.id;
}

async function createFlightsDB() {
  console.log('\n✈️  Creating Flights database...');
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: 'Flights' } }],
    properties: {
      'Flight ID': { title: {} },
      'Passenger ID': { rich_text: {} },
      'Passenger Name': { rich_text: {} },
      'Group ID': {
        select: {
          options: [
            { name: 'group_01', color: 'blue' },
            { name: 'group_02', color: 'green' },
            { name: 'group_03', color: 'orange' },
            { name: 'group_04', color: 'purple' },
            { name: 'group_05', color: 'pink' },
          ],
        },
      },
      'Device ID': { rich_text: {} },
      'Status': {
        select: {
          options: [
            { name: 'boarding', color: 'gray' },
            { name: 'in_flight', color: 'yellow' },
            { name: 'landed', color: 'green' },
            { name: 'cancelled', color: 'red' },
          ],
        },
      },
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
      'Narrative Region': {
        select: {
          options: [
            { name: 'departure_clouds', color: 'gray' },
            { name: 'pacific_drift', color: 'blue' },
            { name: 'deep_night_current', color: 'purple' },
            { name: 'dawn_corridor', color: 'orange' },
            { name: 'arrival_harbor', color: 'green' },
          ],
        },
      },
      'Route Direction': {
        select: {
          options: [
            { name: 'auto', color: 'gray' },
            { name: 'eastbound', color: 'blue' },
            { name: 'westbound', color: 'orange' },
            { name: 'northbound', color: 'purple' },
            { name: 'southbound', color: 'red' },
            { name: 'northeast', color: 'pink' },
            { name: 'northwest', color: 'yellow' },
            { name: 'southeast', color: 'green' },
            { name: 'southwest', color: 'brown' },
            { name: 'circular', color: 'default' },
            { name: 'unknown', color: 'gray' },
          ],
        },
      },
      'Direction Source': {
        select: {
          options: [
            { name: 'system_auto', color: 'gray' },
            { name: 'participant_design', color: 'blue' },
            { name: 'mood_input', color: 'pink' },
            { name: 'weather_input', color: 'purple' },
            { name: 'team_signal', color: 'green' },
            { name: 'physical_interaction', color: 'orange' },
            { name: 'random_card', color: 'yellow' },
            { name: 'future_body_data', color: 'red' },
          ],
        },
      },
      'Direction Note': { rich_text: {} },
      'Captain Broadcast Style': {
        select: {
          options: [
            { name: 'formal_captain', color: 'blue' },
            { name: 'poetic', color: 'purple' },
            { name: 'playful', color: 'yellow' },
            { name: 'flight_attendant', color: 'pink' },
            { name: 'radio_host', color: 'orange' },
            { name: 'custom', color: 'gray' },
          ],
        },
      },
      'Captain Broadcast': { rich_text: {} },
      'Social Cue Type': {
        select: {
          options: [
            { name: 'same_sky', color: 'blue' },
            { name: 'same_region', color: 'purple' },
            { name: 'nearby_region', color: 'green' },
            { name: 'relay_flight', color: 'orange' },
            { name: 'early_landing', color: 'yellow' },
            { name: 'late_landing', color: 'pink' },
            { name: 'solo', color: 'gray' },
          ],
        },
      },
      'Social Cue Text': { rich_text: {} },
      'Related Passenger': { rich_text: {} },
      'Created At': { date: {} },
      'Updated At': { date: {} },
    },
  });
  console.log(`✅ Flights DB created: ${db.id}`);
  return db.id;
}

async function createDestinationsDB() {
  console.log('\n🌍 Creating Destinations database...');
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: 'Destinations' } }],
    properties: {
      'Destination ID': { title: {} },
      'City': { rich_text: {} },
      'Country': { rich_text: {} },
      'Display Name': { rich_text: {} },
      'Latitude': { number: { format: 'number' } },
      'Longitude': { number: { format: 'number' } },
      'Airport Code': { rich_text: {} },
      'Region': {
        select: {
          options: [
            { name: 'East Asia', color: 'blue' },
            { name: 'Southeast Asia', color: 'green' },
            { name: 'South Asia', color: 'orange' },
            { name: 'Middle East', color: 'yellow' },
            { name: 'Europe', color: 'purple' },
            { name: 'Africa', color: 'brown' },
            { name: 'Oceania', color: 'pink' },
            { name: 'North America', color: 'red' },
            { name: 'South America', color: 'default' },
            { name: 'Pacific', color: 'gray' },
          ],
        },
      },
      'Available for Landing': { checkbox: {} },
      'Created At': { date: {} },
      'Updated At': { date: {} },
    },
  });
  console.log(`✅ Destinations DB created: ${db.id}`);
  return db.id;
}

function writeEnvUpdate(
  passengersId: string,
  flightsId: string,
  destinationsId: string
) {
  const envPath = path.join(process.cwd(), '.env.local');
  let content = fs.readFileSync(envPath, 'utf-8');

  const updates: Record<string, string> = {
    NOTION_PASSENGERS_DB_ID: passengersId,
    NOTION_FLIGHTS_DB_ID: flightsId,
    NOTION_DESTINATIONS_DB_ID: destinationsId,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, content);
  console.log('\n✅ .env.local updated with database IDs');
}

async function main() {
  console.log('🚀 Sleep Airline — Notion Setup');
  console.log(`   Workspace page: ${PARENT_PAGE_ID}`);

  try {
    const passengersId = await createPassengersDB();
    const flightsId = await createFlightsDB();
    const destinationsId = await createDestinationsDB();

    writeEnvUpdate(passengersId, flightsId, destinationsId);

    console.log('\n─────────────────────────────────────────');
    console.log('✅ 全部完成！三個 Database 已建立並寫入 .env.local');
    console.log('\n下一步：');
    console.log('  npx tsx scripts/setup-notion.ts   ← 已完成');
    console.log('  npm run dev                        ← 啟動開發伺服器');
    console.log('  POST /api/seed                     ← 匯入 101 個城市');
    console.log('─────────────────────────────────────────\n');
  } catch (err) {
    console.error('\n❌ 發生錯誤:', err instanceof Error ? err.message : err);
    console.error('\n請確認：');
    console.error('  1. NOTION_API_KEY 正確');
    console.error('  2. Sleep Airline 頁面已加入 integration（右上角 Connections）');
    process.exit(1);
  }
}

main();
