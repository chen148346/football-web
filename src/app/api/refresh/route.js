import { NextResponse } from 'next/server';
import { refreshSchedule } from '../../../lib/scheduler.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const count = await refreshSchedule();
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('刷新失败:', error);
    return NextResponse.json({ success: false, error: error.message, code: 'FETCH_FAILED' }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { refreshSchedule } from '../../../lib/scheduler.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 添加 GET 方法
export async function GET() {
  try {
    const count = await refreshSchedule();
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('刷新失败:', error);
    return NextResponse.json({ success: false, error: error.message, code: 'FETCH_FAILED' }, { status: 500 });
  }
}

// 保留 POST 方法
export async function POST() {
  try {
    const count = await refreshSchedule();
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('刷新失败:', error);
    return NextResponse.json({ success: false, error: error.message, code: 'FETCH_FAILED' }, { status: 500 });
  }
}
