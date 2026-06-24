import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOrCreatePassenger } from '../src/lib/notion/passengers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { passengerId, name, groupId, deviceId } = req.body;
    if (!passengerId || !name || !groupId) {
      return res.status(400).json({ error: '請填寫乘客 ID、姓名和小隊 ID。' });
    }
    const result = await getOrCreatePassenger(passengerId, name, groupId, deviceId ?? 'web');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知錯誤' });
  }
}
