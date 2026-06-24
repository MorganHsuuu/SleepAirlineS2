import type { VercelRequest, VercelResponse } from '@vercel/node';
import { seedDestinations } from '../src/lib/notion/destinations';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const result = await seedDestinations();
    res.json({
      message: `完成。新增 ${result.seeded} 個城市，略過 ${result.skipped} 個已存在的城市。`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
}
