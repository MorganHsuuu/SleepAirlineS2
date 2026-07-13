import { getAllActiveFlights } from '../notion/flights';
import {
  listLandingReminders,
  markLandingReminderSent,
  removeLandingReminder,
} from './store';
import { isGonePushError, isWebPushConfigured, sendLandingReminderPush } from './push';
import type { Flight } from '../../types';
import type { ReminderCronResult } from './types';

const DEFAULT_FIRST_REMINDER_MINUTES = 480;
const DEFAULT_REPEAT_REMINDER_MINUTES = 60;

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function flightKey(flight: Flight): string {
  return `${flight.passengerId}:${flight.flightId}`;
}

function isReminderDue(takeoffTime: string, lastReminderAt: string | null, now: Date): boolean {
  const firstMinutes = envMinutes('REMINDER_FIRST_AFTER_MINUTES', DEFAULT_FIRST_REMINDER_MINUTES);
  const repeatMinutes = envMinutes('REMINDER_REPEAT_MINUTES', DEFAULT_REPEAT_REMINDER_MINUTES);
  const takeoffMs = new Date(takeoffTime).getTime();
  if (!Number.isFinite(takeoffMs)) return false;
  const nowMs = now.getTime();
  if (nowMs - takeoffMs < firstMinutes * 60000) return false;
  if (!lastReminderAt) return true;
  const lastMs = new Date(lastReminderAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= repeatMinutes * 60000;
}

export async function runLandingReminderCron(now = new Date()): Promise<ReminderCronResult> {
  const result: ReminderCronResult = {
    checked: 0,
    due: 0,
    sent: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  };

  const records = await listLandingReminders();
  result.checked = records.length;
  if (!isWebPushConfigured()) {
    result.skipped = records.length;
    result.errors.push({ id: 'config', error: 'Web Push VAPID keys are not configured.' });
    return result;
  }

  const activeFlights = await getAllActiveFlights();
  const activeByKey = new Map(activeFlights.map((flight) => [flightKey(flight), flight]));

  for (const record of records) {
    const activeFlight = activeByKey.get(`${record.passengerId}:${record.flightId}`);
    if (!record.enabled || !activeFlight) {
      await removeLandingReminder(record.id);
      result.removed += 1;
      continue;
    }
    if (!isReminderDue(record.takeoffTime || activeFlight.takeoffTime, record.lastReminderAt, now)) {
      result.skipped += 1;
      continue;
    }

    result.due += 1;
    try {
      await sendLandingReminderPush(record);
      await markLandingReminderSent(record.id, now);
      result.sent += 1;
    } catch (err) {
      if (isGonePushError(err)) {
        await removeLandingReminder(record.id);
        result.removed += 1;
        continue;
      }
      result.errors.push({
        id: record.id,
        error: err instanceof Error ? err.message : '未知錯誤',
      });
    }
  }

  return result;
}
