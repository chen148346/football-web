import { NextResponse } from 'next/server';
import { getReport, getReportDownloadUrl } from '../../../lib/supabase_db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportId = parseInt(searchParams.get('id'));
  if (!reportId) return NextResponse.json({ error: '无效的报告ID', code: 'INVALID_INPUT' }, { status: 400 });
  try {
    const report = await getReport(reportId);
    if (!report) return NextResponse.json({ error: '报告不存在', code: 'REPORT_NOT_FOUND' }, { status: 404 });
    const downloadUrl = await getReportDownloadUrl(report.storage_path || report.file_path);
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    return NextResponse.json({ error: error.message, code: 'DOWNLOAD_FAILED' }, { status: 500 });
  }
}
