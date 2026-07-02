import { NextResponse } from 'next/server';
import { quickReport } from '../../../lib/scheduler.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const matchId = parseInt(searchParams.get('id'));
  if (!matchId) return NextResponse.json({ success: false, error: '无效的比赛ID', code: 'INVALID_INPUT' }, { status: 400 });
  try {
    const result = await quickReport(matchId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('报告生成失败:', error);
    return NextResponse.json({ success: false, error: error.message, code: 'REPORT_FAILED' }, { status: 500 });
  }
}
