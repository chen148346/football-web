import { NextResponse } from 'next/server';
import { getSnapshotsByMatch } from '../../../lib/supabase_db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const matchId = parseInt(searchParams.get('id'));
  if (!matchId) return NextResponse.json({ success: false, error: '无效的比赛ID', code: 'INVALID_INPUT' }, { status: 400 });
  try {
    const snapshots = await getSnapshotsByMatch(matchId);
    return NextResponse.json({ success: true, snapshots });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message, code: 'DB_ERROR' }, { status: 500 });
  }
}
