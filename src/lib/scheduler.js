/**
 * 调度器逻辑模块 - 对应本地版 scheduler.py
 */
import { fetchScheduleList, fetchMatchDetail } from './scraper.js';
import {
  getAllMatches, syncMatches, getMatch, upsertMatch, createSnapshot,
  getSnapshotsByMatch, updateMatchHalftimeSnapshot, updateMatchMin60Snapshot,
  updateMatchFulltimeSnapshot, updateFirstSeenState, createReport,
  getFulltimeSnapshotCached, getOrCreateMatch
} from './supabase_db.js';
import { generateReport } from './report_generator.js';
import { generateTeamRecentReports } from './team_report_generator.js';
import { MIN60_SNAPSHOT_LOWER, MIN60_SNAPSHOT_UPPER } from './config.js';

export async function refreshSchedule() {
  const matches = await fetchScheduleList();
  for (const m of matches) {
    const existing = await getMatch(m.id);
    if (!existing) m.first_seen_state = m.latest_state_code;
    else if (existing.first_seen_state === null) await updateFirstSeenState(m.id, m.latest_state_code);
  }
  await syncMatches(matches);
  return matches.length;
}

export async function refreshMatchStatus(matchId) {
  const matches = await fetchScheduleList();
  const match = matches.find(m => m.id === matchId);
  if (match) {
    const existing = await getMatch(matchId);
    if (existing) {
      match.weather = existing.weather || '';
      match.round_info = existing.round_info || '';
      match.first_seen_state = existing.first_seen_state;
    }
    await upsertMatch(match);
    return match;
  }
  return await getMatch(matchId);
}

export async function manualSnapshot(matchId, snapshotType = 'manual') {
  const match = await getMatch(matchId);
  if (!match) throw new Error(`比赛 ${matchId} 不存在`);

  const detail = await fetchMatchDetail(matchId);
  if (detail.weather || detail.roundInfo) {
    const matchUpdate = { ...match };
    if (detail.weather) matchUpdate.weather = detail.weather;
    if (detail.roundInfo) matchUpdate.round_info = detail.roundInfo;
    await upsertMatch(matchUpdate);
  }

  const stateCode = match.latest_state_code || 0;
  const stateText = match.latest_state_text || '';
  let elapsed = match.latest_elapsed_min || 0;

  if (snapshotType === 'manual') {
    if (stateCode === -1) snapshotType = 'fulltime';
    else if (stateCode === 2) snapshotType = 'halftime';
    else if (stateCode === 3 && elapsed >= MIN60_SNAPSHOT_LOWER && elapsed <= MIN60_SNAPSHOT_UPPER) snapshotType = 'min60';
  }

  const snapshot = await createSnapshot({
    match_id: matchId, snapshot_type: snapshotType, state_code: stateCode, state_text: stateText,
    home_score: match.latest_home_score || 0, away_score: match.latest_away_score || 0,
    home_half_score: match.latest_home_half_score || 0, away_half_score: match.latest_away_half_score || 0,
    elapsed_min: elapsed,
    shijian_json: detail.shijianJson ? JSON.stringify(detail.shijianJson) : null,
    analysis_json: detail.analysisJson ? JSON.stringify(detail.analysisJson) : null,
  });

  if (snapshotType === 'halftime') await updateMatchHalftimeSnapshot(matchId, snapshot.id);
  else if (snapshotType === 'min60') await updateMatchMin60Snapshot(matchId, snapshot.id);
  else if (snapshotType === 'fulltime') await updateMatchFulltimeSnapshot(matchId, snapshot.id);

  return { snapshot, detail };
}

export async function quickReport(matchId) {
  const match = await refreshMatchStatus(matchId);
  const { snapshot, detail } = await manualSnapshot(matchId);
  const stateCode = match.latest_state_code || 0;
  const elapsed = match.latest_elapsed_min || 0;
  let reportType = 'manual';
  if (stateCode === -1) reportType = 'fulltime';
  else if (stateCode === 2) reportType = 'halftime';
  else if (stateCode === 3 && elapsed >= 58) reportType = 'min60';

  const result = await generateReport(match, snapshot, detail.shijianJson, detail.analysisJson, reportType);
  await createReport({
    match_id: matchId, snapshot_id: snapshot.id, report_type: reportType,
    file_path: result.storagePath, file_name: result.fileName, storage_path: result.storagePath,
  });
  return { fileName: result.fileName, storagePath: result.storagePath, snapshotId: snapshot.id };
}

export { generateTeamRecentReports } from './team_report_generator.js';
