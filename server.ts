import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import { join } from 'path';

import { getOrCreatePassenger, updatePassengerStatus } from './src/lib/notion/passengers';
import { createFlight, getActiveFlight, updateFlight, getGroupFlights, getAllActiveFlights } from './src/lib/notion/flights';
import { getAvailableDestinations, seedDestinations } from './src/lib/notion/destinations';
import { calculateFlightDistance } from './src/lib/flight/distance';
import { calculateFlightProgress } from './src/lib/flight/progress';
import { getNarrativeRegion } from './src/lib/flight/region';
import { findArrivalDestination } from './src/lib/flight/direction';
import { calculateGroupSocialCue } from './src/lib/flight/social';
import { generateCaptainBroadcast } from './src/lib/ai/broadcast';

import type { RouteDirection, DirectionSource, BroadcastStyle, NarrativeRegion } from './src/types';

const app = express();
app.use(express.json());
app.use(express.static(join(process.cwd(), 'public')));

// ── POST /api/passenger ───────────────────────────────────────────────────────

app.post('/api/passenger', async (req, res) => {
  try {
    const { passengerId, name, groupId, deviceId } = req.body;
    if (!passengerId || !name || !groupId) {
      res.status(400).json({ error: '請填寫乘客 ID、姓名和小隊 ID。' });
      return;
    }
    const result = await getOrCreatePassenger(passengerId, name, groupId, deviceId ?? 'web');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── POST /api/flight/takeoff ──────────────────────────────────────────────────

app.post('/api/flight/takeoff', async (req, res) => {
  try {
    const {
      passengerId,
      deviceId = 'web',
      routeDirection = 'auto',
      directionSource = 'system_auto',
      directionNote = null,
    } = req.body;

    if (!passengerId) { res.status(400).json({ error: '請提供乘客 ID。' }); return; }

    const { passenger } = await getOrCreatePassenger(passengerId, '', '', deviceId);

    const existing = await getActiveFlight(passengerId);
    if (existing) {
      res.status(409).json({ error: 'already_in_flight', message: '你已有一趟尚未降落的航班，請先降落或取消。' });
      return;
    }

    const flight = await createFlight({
      passengerId,
      passengerName: passenger.name,
      groupId: passenger.groupId,
      deviceId,
      departureLocation: passenger.currentLocation,
      departureLatitude: passenger.currentLatitude,
      departureLongitude: passenger.currentLongitude,
      routeDirection: routeDirection as RouteDirection,
      directionSource: directionSource as DirectionSource,
      directionNote,
    });

    await updatePassengerStatus(passenger.notionId, {
      status: 'in_flight',
      lastFlightId: flight.flightId,
    });

    res.json({ flight });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
});

// ── POST /api/flight/land ─────────────────────────────────────────────────────

app.post('/api/flight/land', async (req, res) => {
  try {
    const { passengerId, broadcastStyle = 'formal_captain' } = req.body;
    if (!passengerId) { res.status(400).json({ error: '請提供乘客 ID。' }); return; }

    const { passenger } = await getOrCreatePassenger(passengerId, '', '', 'web');
    const activeFlight = await getActiveFlight(passengerId);

    if (!activeFlight) {
      res.status(404).json({ error: 'no_active_flight', message: '找不到進行中的航班。' });
      return;
    }

    const landingTime = new Date().toISOString();
    const durationMinutes = Math.round(
      (new Date(landingTime).getTime() - new Date(activeFlight.takeoffTime).getTime()) / 60000
    );
    const distanceKm = calculateFlightDistance(durationMinutes);
    const progress = calculateFlightProgress(activeFlight.takeoffTime);
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

    const groupFlights = await getGroupFlights(passenger.groupId);
    const socialCue = calculateGroupSocialCue(
      { passengerId, narrativeRegion: region, landingTime },
      groupFlights
    );

    let captainBroadcast = '';
    try {
      captainBroadcast = await generateCaptainBroadcast({
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
      });
    } catch {
      captainBroadcast = `歡迎抵達 ${arrival.displayName}。本次航班自 ${activeFlight.departureLocation} 出發，飛行時長 ${durationMinutes} 分鐘。${socialCue.cueText}`;
    }

    await updateFlight(activeFlight.notionId, {
      status: 'landed',
      landingTime,
      flightDurationMinutes: durationMinutes,
      estimatedFlightDistanceKm: Math.round(distanceKm),
      arrivalLocation: arrival.displayName,
      arrivalLatitude: arrival.latitude,
      arrivalLongitude: arrival.longitude,
      flightProgress: 100,
      narrativeRegion: 'arrival_harbor',
      captainBroadcastStyle: broadcastStyle as BroadcastStyle,
      captainBroadcast,
      socialCueType: socialCue.cueType,
      socialCueText: socialCue.cueText,
      relatedPassenger: socialCue.relatedPassenger ?? '',
    });

    await updatePassengerStatus(passenger.notionId, {
      status: 'landed',
      currentLocation: arrival.displayName,
      currentLatitude: arrival.latitude,
      currentLongitude: arrival.longitude,
      lastFlightId: activeFlight.flightId,
    });

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

    const flights = await getGroupFlights(groupId);
    const enriched = flights.map((f) => {
      if (f.status !== 'in_flight') return f;
      const progress = calculateFlightProgress(f.takeoffTime);
      const region = getNarrativeRegion(progress);
      return { ...f, flightProgress: progress, narrativeRegion: region };
    });
    res.json({ flights: enriched });
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

// ── POST /api/seed ────────────────────────────────────────────────────────────

app.post('/api/seed', async (_req, res) => {
  try {
    const result = await seedDestinations();
    res.json({
      message: `完成。新增 ${result.seeded} 個城市，略過 ${result.skipped} 個已存在的城市。`,
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
