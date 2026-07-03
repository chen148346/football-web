import { NextResponse } from 'next/server';
import { refreshSchedule } from '../../../lib/scheduler.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vercel Cron 每天凌晨0点自动刷新比赛列表
export async function GET(request) {
  // 验证 Cron 密钥（如果配置了的话）
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const count = await refreshSchedule();
    return NextResponse.json({ success: true, count, time: new Date().toISOString() });
  } catch (error) {
    console.error('Cron刷新失败:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
