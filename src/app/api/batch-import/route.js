import { NextResponse } from 'next/server';
import { fetchMatchDetail, extractMatchInfoFromHtml } from '../../../lib/scraper.js';
import { getFulltimeSnapshotCached, createSnapshot, updateMatchFulltimeSnapshot, getOrCreateMatch, upsertMatch, createReport } from '../../../lib/supabase_db.js';
import { generateReport } from '../../../lib/report_generator.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ success: false, error: '未上传文件', code: 'INVALID_FILE' }, { status: 400 });

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && /^\d+$/.test(l));
    const matchIds = lines.map(l => parseInt(l));

    const results = [];
    let success = 0, skippedNotExist = 0, skippedNotFinished = 0, skippedError = 0;

    for (let i = 0; i < matchIds.length; i++) {
      const mid = matchIds[i];
      const result = { id: mid, status: '', message: '', report_id: null, file_name: null };
      try {
        let snapshot = await getFulltimeSnapshotCached(mid);
        if (snapshot && snapshot.shijian_json) {
          // 命中缓存，检查是否已有报告
          result.status = 'success';
          result.message = '命中本地缓存';
          success++;
        } else {
          const detail = await fetchMatchDetail(mid);
          if (!detail || !detail.shijianJson) {
            result.status = 'skipped';
            result.message = 'ID不存在或无法获取数据';
            skippedNotExist++;
            results.push(result);
            continue;
          }
          const info = detail.shijianJson.info || {};
          if (info.stateCode !== -1) {
            result.status = 'skipped';
            result.message = `未完场(state=${info.stateCode})`;
            skippedNotFinished++;
            results.push(result);
            continue;
          }
          const matchInfo = extractMatchInfoFromHtml(detail.shijianHtml || '');
          const match = await getOrCreateMatch(mid, matchInfo.sclass_name || '', info.homeName || '', info.awayName || '');
          const matchUpdate = { ...match };
          if (matchInfo.sclass_name) matchUpdate.sclass_name = matchInfo.sclass_name;
          if (matchInfo.round_info) matchUpdate.round_info = matchInfo.round_info;
          if (matchInfo.weather) matchUpdate.weather = matchInfo.weather;
          if (matchInfo.match_time) matchUpdate.match_time = matchInfo.match_time;
          if (matchInfo.home_rank) matchUpdate.home_rank = matchInfo.home_rank;
          if (matchInfo.away_rank) matchUpdate.away_rank = matchInfo.away_rank;
          matchUpdate.latest_state_code = -1;
          matchUpdate.latest_state_text = '完场';
          matchUpdate.latest_state_display = '完场';
          matchUpdate.latest_home_score = matchInfo.home_score;
          matchUpdate.latest_away_score = matchInfo.away_score;
          matchUpdate.latest_home_half_score = matchInfo.home_half_score;
          matchUpdate.latest_away_half_score = matchInfo.away_half_score;
          await upsertMatch(matchUpdate);

          snapshot = await createSnapshot({
            match_id: mid, snapshot_type: 'fulltime', state_code: -1, state_text: '完场',
            home_score: matchInfo.home_score, away_score: matchInfo.away_score,
            home_half_score: matchInfo.home_half_score, away_half_score: matchInfo.away_half_score,
            elapsed_min: 90,
            shijian_json: JSON.stringify(detail.shijianJson),
            analysis_json: detail.analysisJson ? JSON.stringify(detail.analysisJson) : null,
          });
          await updateMatchFulltimeSnapshot(mid, snapshot.id);

          const reportResult = await generateReport(matchUpdate, snapshot, detail.shijianJson, detail.analysisJson, 'fulltime');
          const reportRecord = await createReport({
            match_id: mid, snapshot_id: snapshot.id, report_type: 'fulltime',
            file_path: reportResult.storagePath, file_name: reportResult.fileName,
            storage_path: reportResult.storagePath,
          });
          result.status = 'success';
          result.message = `报告已生成: ${reportResult.fileName}`;
          result.report_id = reportRecord.id;
          result.file_name = reportResult.fileName;
          success++;
        }
      } catch (e) {
        result.status = 'error';
        result.message = e.message;
        skippedError++;
      }
      results.push(result);

      // 防爬延迟
      if (i < matchIds.length - 1) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      }
    }

    return NextResponse.json({
      success: true,
      result: { total: matchIds.length, success, skipped_not_exist: skippedNotExist, skipped_not_finished: skippedNotFinished, skipped_error: skippedError, results }
    });
  } catch (error) {
    console.error('批量导入失败:', error);
    return NextResponse.json({ success: false, error: error.message, code: 'BATCH_IMPORT_FAILED' }, { status: 500 });
  }
}
