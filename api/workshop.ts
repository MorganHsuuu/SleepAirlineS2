import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllActiveFlights } from '../src/lib/notion/flights';
import { calculateFlightProgress } from '../src/lib/flight/progress';
import { getNarrativeRegion } from '../src/lib/flight/region';
import type { NarrativeRegion } from '../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
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
}
