import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOrCreatePassenger, updatePassengerStatus } from '../../src/lib/notion/passengers';
import { getActiveFlight, createFlight } from '../../src/lib/notion/flights';
import type { RouteDirection, DirectionSource } from '../../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const {
      passengerId,
      deviceId = 'web',
      routeDirection = 'auto',
      directionSource = 'system_auto',
      directionNote = null,
    } = req.body;

    if (!passengerId) return res.status(400).json({ error: '請提供乘客 ID。' });

    const { passenger } = await getOrCreatePassenger(passengerId, '', '', deviceId);

    const existing = await getActiveFlight(passengerId);
    if (existing) {
      return res.status(409).json({ error: 'already_in_flight', message: '你已有一趟尚未降落的航班，請先降落或取消。' });
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
}
