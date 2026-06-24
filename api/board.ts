import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGroupFlights } from '../src/lib/notion/flights';
import { calculateFlightProgress } from '../src/lib/flight/progress';
import { getNarrativeRegion } from '../src/lib/flight/region';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const groupId = req.query.groupId as string;
    if (!groupId) return res.status(400).json({ error: '請提供 groupId。' });

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
}
