import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import { join } from 'path';

import { getOrCreatePassenger } from './src/lib/notion/passengers';
import {
  createFlight, getActiveFlight, updateFlight, getGroupFlights, getGroupBoardFlights,
  getLastLandedFlight, getAllActiveFlights, parseFlight,
} from './src/lib/notion/flights';
import { getAvailableDestinations, seedDestinations } from './src/lib/notion/destinations';
import { calculateFlightDistance } from './src/lib/flight/distance';
import { calculateFlightProgress } from './src/lib/flight/progress';
import { getNarrativeRegion } from './src/lib/flight/region';
import { findArrivalDestination } from './src/lib/flight/direction';
import { fetchLocalContext, resolveCountryIso } from './src/lib/flight/local-context';
import { resolveGroupSocialCue } from './src/lib/flight/social';
import { generateCaptainBroadcast, fallbackCaptainBroadcast } from './src/lib/ai/broadcast';
import { generateBroadcastSpeech } from './src/lib/ai/speech';
import { getLandscapeByFlightId } from './src/lib/notion/landscape-images';
import { backfillSceneryForFlights } from './src/lib/notion/scenery-backfill';
import { withTimeout } from './src/lib/with-timeout';
import { getDataModeStatus } from './src/lib/data-mode';

import type { RouteDirection, BroadcastStyle, NarrativeRegion, SocialCue } from './src/types';

const SOLO_SOCIAL_CUE: SocialCue = {
  cueType: 'solo',
  relatedPassenger: null,
  cueText: '今晚你獨自飛行。同組雷達上暫時只有你一人。',
};

async function resolveSocialCueWithBudget(
  current: Parameters<typeof resolveGroupSocialCue>[0],
  groupFlights: Awaited<ReturnType<typeof getGroupFlights>>
): Promise<SocialCue> {
  return withTimeout(resolveGroupSocialCue(current, groupFlights), 8_000, () => SOLO_SOCIAL_CUE);
}

async function generateBroadcastWithBudget(
  input: Parameters<typeof generateCaptainBroadcast>[0],
  fallback: () => string
): Promise<string> {
  try {
    return await withTimeout(generateCaptainBroadcast(input), 12_000, fallback);
  } catch {
    return fallback();
  }
}

async function generateSpeechWithBudget(
  text: string,
  style: BroadcastStyle
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY || !text?.trim()) return null;
  try {
    return await withTimeout(
      generateBroadcastSpeech(text.trim(), style).then((buf) => buf.toString('base64')),
      12_000,
      () => null
    );
  } catch {
    return null;
  }
}

function parseDisplayLocation(displayName: string): { cityName: string; countryName: string } {
  const parts = displayName.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { cityName: parts[0], countryName: parts[parts.length - 1] };
  }
  return { cityName: displayName, countryName: '' };
}
import { formatNotionError } from './src/lib/notion/db-access';
import { introspectNotionSchemas } from './src/lib/notion/schema-introspect';

const app = express();
app.use(express.json());
app.use(express.static(join(process.cwd(), 'public')));

// ── GET /api/config ───────────────────────────────────────────────────────────

app.get('/api/config', async (_req, res) => {
  try {
    res.json(await getDataModeStatus());
  } catch (err) {
    res.status(500).json({ error: formatNotionError(err) });
  }
});

// ── GET /api/notion/schema ────────────────────────────────────────────────────

/** 讀取主辦 Notion 總表目前實際欄位（對照刪欄後的現況）。 */
app.get('/api/notion/schema', async (_req, res) => {
  try {
    res.json(await introspectNotionSchemas());
  } catch (err) {
    res.status(500).json({ error: formatNotionError(err) });
  }
});

// ── POST /api/passenger ───────────────────────────────────────────────────────

app.post('/api/passenger', async (req, res) => {
  try {
    const { passengerId, name, groupId } = req.body;
    if (!passengerId || !name || !groupId) {
      res.status(400).json({ error: '請填寫乘客 ID、姓名和小隊 ID。' });
      return;
    }
    const result = await getOrCreatePassenger(passengerId, name, groupId);

    // 飛行中：直接用已查到的航班列更新姓名／小隊，不再重打 getActiveFlight
    if (result.passenger.status === 'in_flight' && result.sourcePage) {
      const patch: { passengerName?: string; groupId?: string } = {};
      if (name && name !== result.passenger.name) patch.passengerName = name;
      if (groupId && groupId !== result.passenger.groupId) patch.groupId = groupId;
      if (Object.keys(patch).length > 0) {
        await updateFlight(result.passenger.notionId, patch);
        if (patch.passengerName) result.passenger.name = patch.passengerName;
        if (patch.groupId) result.passenger.groupId = patch.groupId;
      }
    }

    // 重用 getOrCreatePassenger 已查到的 landed 列，避免再打一次 Notion
    let lastLandedFlight = null;
    if (result.passenger.status !== 'in_flight') {
      if (result.sourceKind === 'landed' && result.sourcePage) {
        lastLandedFlight = parseFlight(result.sourcePage);
      } else {
        lastLandedFlight = await getLastLandedFlight(passengerId);
      }
    }

    // 風景圖改由前端背景載入，不擋登入回應
    res.json({
      passenger: result.passenger,
      created: result.created,
      lastLandedFlight,
      landingScenery: null,
    });
  } catch (err) {
    const message = formatNotionError(err);
    res.status(500).json({ error: message, message });
  }
});

// ── POST /api/flight/takeoff ──────────────────────────────────────────────────

app.post('/api/flight/takeoff', async (req, res) => {
  try {
    const {
      passengerId,
      name = '',
      groupId = '',
      routeDirection = 'auto',
      broadcastStyle = 'formal_captain',
      simulatedTakeoffTime,
    } = req.body;

    if (!passengerId) { res.status(400).json({ error: '請提供乘客 ID。' }); return; }

    const { passenger } = await getOrCreatePassenger(passengerId, name, groupId);
    if (!passenger.name || !passenger.groupId) {
      res.status(400).json({
        error: 'missing_profile',
        message: '找不到乘客姓名或小隊，請重新登入後再起飛。',
      });
      return;
    }

    const existing = await getActiveFlight(passengerId);
    if (existing) {
      res.status(409).json({ error: 'already_in_flight', message: '你已有一趟尚未降落的航班，請先降落或取消。' });
      return;
    }

    const takeoffTime = typeof simulatedTakeoffTime === 'string' && simulatedTakeoffTime
      ? simulatedTakeoffTime
      : undefined;

    const flight = await createFlight({
      passengerId,
      passengerName: passenger.name,
      groupId: passenger.groupId,
      departureLocation: passenger.currentLocation,
      departureLatitude: passenger.currentLatitude,
      departureLongitude: passenger.currentLongitude,
      routeDirection: routeDirection as RouteDirection,
      takeoffTime,
    });

    const groupFlights = await getGroupFlights(passenger.groupId);
    const depPlace = parseDisplayLocation(flight.departureLocation);
    const [socialCue, depLocal] = await Promise.all([
      resolveSocialCueWithBudget(
        {
          passengerId,
          passengerName: passenger.name,
          departureLocation: flight.departureLocation,
          departureLatitude: flight.departureLatitude,
          departureLongitude: flight.departureLongitude,
          arrivalLocation: null,
          arrivalLatitude: null,
          arrivalLongitude: null,
          routeDirection: flight.routeDirection,
          takeoffTime: flight.takeoffTime,
          landingTime: null,
          flightProgress: 0,
          phase: 'takeoff',
        },
        groupFlights
      ),
      fetchLocalContext({
        cityName: depPlace.cityName,
        countryName: depPlace.countryName,
        countryIso: resolveCountryIso(
          flight.departureLatitude,
          flight.departureLongitude,
          flight.departureLocation
        ),
        latitude: flight.departureLatitude,
        longitude: flight.departureLongitude,
      }).catch(() => null),
    ]);

    const takeoffBroadcast = await generateBroadcastWithBudget(
      {
        phase: 'takeoff',
        passengerName: passenger.name,
        departureLocation: flight.departureLocation,
        arrivalLocation: null,
        narrativeRegion: 'departure_clouds',
        flightDurationMinutes: null,
        flightProgress: 0,
        estimatedDistanceKm: null,
        routeDirection: flight.routeDirection,
        socialCue,
        style: broadcastStyle as BroadcastStyle,
        localContext: depLocal,
      },
      () => fallbackCaptainBroadcast(
        'takeoff',
        passenger.name,
        flight.departureLocation,
        null,
        flight.routeDirection,
        null,
        socialCue.cueText,
        depLocal
      )
    );

    const [_, speechAudioBase64] = await Promise.all([
      updateFlight(flight.notionId, {
        takeoffBroadcastStyle: broadcastStyle as BroadcastStyle,
        takeoffBroadcast,
        socialCueType: socialCue.cueType,
        socialCueText: socialCue.cueText,
        relatedPassenger: socialCue.relatedPassenger ?? '',
      }),
      generateSpeechWithBudget(takeoffBroadcast, broadcastStyle as BroadcastStyle),
    ]);

    res.json({
      flight: {
        ...flight,
        takeoffBroadcastStyle: broadcastStyle as BroadcastStyle,
        takeoffBroadcast,
        socialCueType: socialCue.cueType,
        socialCueText: socialCue.cueText,
        relatedPassenger: socialCue.relatedPassenger,
      },
      speechAudioBase64,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── POST /api/flight/land ─────────────────────────────────────────────────────

app.post('/api/flight/land', async (req, res) => {
  try {
    const {
      passengerId,
      name = '',
      groupId = '',
      broadcastStyle = 'formal_captain',
      simulatedDurationMinutes,
      simulatedLandingTime,
    } = req.body;
    if (!passengerId) { res.status(400).json({ error: '請提供乘客 ID。' }); return; }

    const { passenger } = await getOrCreatePassenger(passengerId, name, groupId);
    const activeFlight = await getActiveFlight(passengerId);

    if (!activeFlight) {
      res.status(404).json({ error: 'no_active_flight', message: '找不到進行中的航班。' });
      return;
    }

    const simMinutes = typeof simulatedDurationMinutes === 'number' && simulatedDurationMinutes > 0
      ? Math.round(simulatedDurationMinutes)
      : null;
    const landingTime = typeof simulatedLandingTime === 'string' && simulatedLandingTime
      ? simulatedLandingTime
      : simMinutes
        ? new Date(new Date(activeFlight.takeoffTime).getTime() + simMinutes * 60000).toISOString()
        : new Date().toISOString();
    const durationMinutes = Math.max(1, Math.round(
      (new Date(landingTime).getTime() - new Date(activeFlight.takeoffTime).getTime()) / 60000
    ));
    const distanceKm = calculateFlightDistance(durationMinutes);
    const progress = 100;
    const region = getNarrativeRegion(progress);

    const destinations = await getAvailableDestinations();
    const arrival = findArrivalDestination(
      activeFlight.departureLatitude,
      activeFlight.departureLongitude,
      distanceKm,
      activeFlight.routeDirection,
      destinations,
      activeFlight.departureLocation
    );

    const arrPlace = parseDisplayLocation(arrival.displayName);
    const [groupFlights, arrLocal] = await Promise.all([
      getGroupFlights(passenger.groupId),
      fetchLocalContext({
        cityName: arrival.city || arrPlace.cityName,
        countryName: arrival.country || arrPlace.countryName,
        countryIso: arrival.countryIso,
        latitude: arrival.latitude,
        longitude: arrival.longitude,
      }).catch(() => null),
    ]);
    const socialCue = await resolveSocialCueWithBudget(
      {
        passengerId,
        passengerName: passenger.name,
        departureLocation: activeFlight.departureLocation,
        departureLatitude: activeFlight.departureLatitude,
        departureLongitude: activeFlight.departureLongitude,
        arrivalLocation: arrival.displayName,
        arrivalLatitude: arrival.latitude,
        arrivalLongitude: arrival.longitude,
        routeDirection: activeFlight.routeDirection,
        takeoffTime: activeFlight.takeoffTime,
        landingTime,
        flightProgress: 100,
        phase: 'landing',
      },
      groupFlights
    );

    const broadcastFallback = () => fallbackCaptainBroadcast(
      'landing',
      passenger.name,
      activeFlight.departureLocation,
      arrival.displayName,
      activeFlight.routeDirection,
      durationMinutes,
      socialCue.cueText,
      arrLocal
    );

    const captainBroadcast = await generateBroadcastWithBudget(
      {
        phase: 'landing',
        passengerName: passenger.name,
        departureLocation: activeFlight.departureLocation,
        arrivalLocation: arrival.displayName,
        narrativeRegion: region,
        flightDurationMinutes: durationMinutes,
        flightProgress: 100,
        estimatedDistanceKm: distanceKm,
        routeDirection: activeFlight.routeDirection,
        socialCue,
        style: broadcastStyle as BroadcastStyle,
        localContext: arrLocal,
      },
      broadcastFallback
    );

    const [_, speechAudioBase64] = await Promise.all([
      updateFlight(activeFlight.notionId, {
        status: 'landed',
        landingTime,
        flightDurationMinutes: durationMinutes,
        estimatedFlightDistanceKm: Math.round(distanceKm),
        arrivalLocation: arrival.displayName,
        arrivalLatitude: arrival.latitude,
        arrivalLongitude: arrival.longitude,
        captainBroadcast,
        socialCueType: socialCue.cueType,
        socialCueText: socialCue.cueText,
        relatedPassenger: socialCue.relatedPassenger ?? '',
      }),
      generateSpeechWithBudget(captainBroadcast, broadcastStyle as BroadcastStyle),
    ]);

    res.json({
      flight: {
        ...activeFlight,
        status: 'landed',
        landingTime,
        flightDurationMinutes: durationMinutes,
        estimatedFlightDistanceKm: Math.round(distanceKm),
        arrivalLocation: arrival.displayName,
        arrivalLatitude: arrival.latitude,
        arrivalLongitude: arrival.longitude,
        flightProgress: 100,
        narrativeRegion: 'arrival_harbor',
        captainBroadcast,
        socialCueType: socialCue.cueType,
        socialCueText: socialCue.cueText,
        relatedPassenger: socialCue.relatedPassenger,
      },
      landingScenery: null,
      speechAudioBase64,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── GET /api/flight/progress ──────────────────────────────────────────────────

app.get('/api/flight/progress', async (req, res) => {
  try {
    const passengerId = req.query.passengerId as string;
    if (!passengerId) { res.status(400).json({ error: '請提供 passengerId。' }); return; }

    const flight = await getActiveFlight(passengerId);
    if (!flight) { res.json({ activeFlight: null }); return; }

    const progress = calculateFlightProgress(flight.takeoffTime);
    const region = getNarrativeRegion(progress);
    res.json({ activeFlight: { ...flight, flightProgress: progress, narrativeRegion: region } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── GET /api/board ────────────────────────────────────────────────────────────

app.get('/api/board', async (req, res) => {
  try {
    const groupId = req.query.groupId as string;
    if (!groupId) { res.status(400).json({ error: '請提供 groupId。' }); return; }

    const flights = await getGroupBoardFlights(groupId);
    const enriched = flights.map((f) => {
      if (f.status !== 'in_flight') return f;
      const progress = calculateFlightProgress(f.takeoffTime);
      const region = getNarrativeRegion(progress);
      return {
        ...f,
        arrivalLocation: null,
        arrivalLatitude: null,
        arrivalLongitude: null,
        landingTime: null,
        flightDurationMinutes: null,
        estimatedFlightDistanceKm: null,
        captainBroadcast: null,
        flightProgress: progress,
        narrativeRegion: region,
      };
    });
    res.json({ flights: enriched });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── GET /api/scenery ──────────────────────────────────────────────────────────
// 唯讀：依 flightId 取降落風景（供小隊看板查看隊友的降落風景圖）

app.get('/api/scenery', async (req, res) => {
  try {
    const flightId = req.query.flightId as string;
    if (!flightId) { res.status(400).json({ error: '請提供 flightId。' }); return; }
    const scenery = await getLandscapeByFlightId(flightId);
    res.json({ scenery });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── GET /api/scenery-image ────────────────────────────────────────────────────
// 同源代理降落風景圖：Notion 檔案是 S3 簽名網址、沒有 CORS 標頭，
// 前端 DOM 擷取（html2canvas）讀不到跨域 pixel，改由伺服器抓回再轉送。

app.get('/api/scenery-image', async (req, res) => {
  try {
    const flightId = req.query.flightId as string;
    if (!flightId) { res.status(400).json({ error: '請提供 flightId。' }); return; }
    const scenery = await getLandscapeByFlightId(flightId);
    const imageUrl = scenery?.imageUrl;
    if (!imageUrl) { res.status(404).json({ error: '找不到風景圖。' }); return; }

    if (imageUrl.startsWith('data:')) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(imageUrl);
      if (!match) { res.status(500).json({ error: '風景圖格式錯誤。' }); return; }
      const buffer = match[2]
        ? Buffer.from(match[3], 'base64')
        : Buffer.from(decodeURIComponent(match[3]), 'utf8');
      res.setHeader('Content-Type', match[1] || 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
      return;
    }

    const upstream = await fetch(imageUrl);
    if (!upstream.ok) { res.status(502).json({ error: `風景圖下載失敗（${upstream.status}）。` }); return; }
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── GET /api/workshop ─────────────────────────────────────────────────────────

app.get('/api/workshop', async (_req, res) => {
  try {
    const activeFlights = await getAllActiveFlights();
    const groupIds = new Set(activeFlights.map((f) => f.groupId));

    const regionCounts: Partial<Record<NarrativeRegion, number>> = {};
    for (const f of activeFlights) {
      const progress = calculateFlightProgress(f.takeoffTime);
      const region = getNarrativeRegion(progress);
      regionCounts[region] = (regionCounts[region] ?? 0) + 1;
    }

    const mostCommonRegion = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] as NarrativeRegion | undefined;

    res.json({
      summary: {
        activeGroupCount: groupIds.size,
        totalInFlightCount: activeFlights.length,
        totalLandedCount: null,
        mostCommonRegion: mostCommonRegion ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── POST /api/broadcast/speech ────────────────────────────────────────────────

app.post('/api/broadcast/speech', async (req, res) => {
  try {
    const { text, style } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: '請提供廣播文字。' });
      return;
    }
    const audio = await generateBroadcastSpeech(text.trim(), style as BroadcastStyle | undefined);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(audio);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '語音生成失敗' });
  }
});

// ── POST /api/scenery/backfill ────────────────────────────────────────────────

app.post('/api/scenery/backfill', async (req, res) => {
  try {
    const { flightIds, force } = req.body as { flightIds?: string[]; force?: boolean };
    if (!Array.isArray(flightIds) || flightIds.length === 0) {
      res.status(400).json({ error: '請提供 flightIds 陣列。' });
      return;
    }
    if (flightIds.length > 10) {
      res.status(400).json({ error: '一次最多 10 筆。' });
      return;
    }
    const results = await backfillSceneryForFlights(flightIds, { force: !!force });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── POST /api/seed ────────────────────────────────────────────────────────────

app.post('/api/seed', async (_req, res) => {
  try {
    const result = await seedDestinations();
    res.json({
      message: `城市資料已在後台載入（${result.skipped} 筆），不需寫入 Notion。`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => {
    console.log(`✈  甦醒航班 server running → http://localhost:${PORT}`);
  });
}

export default app;
