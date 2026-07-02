import { NextResponse } from 'next/server';
import { getAllMatches } from '../../../lib/supabase_db.js';
import { STATE_SORT_PRIORITY } from '../../../lib/config.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sclassFilter = searchParams.get('sclass') || '';
    const stateFilter = searchParams.get('state') || '';

    let matches = await getAllMatches();

    if (sclassFilter) matches = matches.filter(m => m.sclass_name === sclassFilter);
    if (stateFilter === 'live') matches = matches.filter(m => [1,2,3,4].includes(m.latest_state_code));
    else if (stateFilter === 'upcoming') matches = matches.filter(m => m.latest_state_code === 0);
    else if (stateFilter === 'finished') matches = matches.filter(m => m.latest_state_code === -1);
    else if (stateFilter === 'other') matches = matches.filter(m => [-10,-11,-12,-13,-14].includes(m.latest_state_code));

    matches.sort((a, b) => {
      const pa = STATE_SORT_PRIORITY[a.latest_state_code] ?? 99;
      const pb = STATE_SORT_PRIORITY[b.latest_state_code] ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.match_time || '').localeCompare(b.match_time || '');
    });

    const sclassSet = new Set();
    matches.forEach(m => { if (m.sclass_name) sclassSet.add(m.sclass_name); });

    return NextResponse.json({ success: true, matches, sclassList: Array.from(sclassSet).sort(), total: matches.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message, code: 'DB_ERROR' }, { status: 500 });
  }
}
