import { NextResponse } from 'next/server';
import { getMatch } from '../../../lib/supabase_db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const matchId = parseInt(searchParams.get('id'));
  if (!matchId) return NextResponse.json({ success: false, error: '无效的比赛ID', code: 'INVALID_INPUT' }, { status: 400 });
  try {
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ success: false, error: '比赛不存在', code: 'MATCH_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ success: true, match });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message, code: 'DB_ERROR' }, { status: 500 });
  }
}
