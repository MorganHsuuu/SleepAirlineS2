import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getActiveFlight } from '../../src/lib/notion/flights';
import { calculateFlightProgress } from '../../src/lib/flight/progress';
import { getNarrativeRegion } from '../../src/lib/flight/region';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const passengerId = req.query.passengerId as string;
    if (!passengerId) return res.status(400).json({ error: '請提供 passengerId。' });

    const flight = await getActiveFlight(passengerId);
    if (!flight) return res.json({ activeFlight: null });

    const progress = calculateFlightProgress(flight.takeoffTime);
    const region = getNarrativeRegion(progress);
    res.json({ activeFlight: { ...flight, flightProgress: progress, narrativeRegion: region } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
}
