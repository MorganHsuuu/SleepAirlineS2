import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOrCreatePassenger, updatePassengerStatus } from '../../src/lib/notion/passengers';
import { getActiveFlight, updateFlight, getGroupFlights } from '../../src/lib/notion/flights';
import { getAvailableDestinations } from '../../src/lib/notion/destinations';
import { calculateFlightDistance } from '../../src/lib/flight/distance';
import { calculateFlightProgress } from '../../src/lib/flight/progress';
import { getNarrativeRegion } from '../../src/lib/flight/region';
import { findArrivalDestination } from '../../src/lib/flight/direction';
import { calculateGroupSocialCue } from '../../src/lib/flight/social';
import { generateCaptainBroadcast } from '../../src/lib/ai/broadcast';
import type { BroadcastStyle } from '../../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { passengerId, broadcastStyle = 'formal_captain' } = req.body;
    if (!passengerId) return res.status(400).json({ error: '請提供乘客 ID。' });

    const { passenger } = await getOrCreatePassenger(passengerId, '', '', 'web');
    const activeFlight = await getActiveFlight(passengerId);

    if (!activeFlight) {
      return res.status(404).json({ error: 'no_active_flight', message: '找不到進行中的航班。' });
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
}
