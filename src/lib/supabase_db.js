/**
 * Supabase 数据访问层 - 对应本地版 db.py
 * 完整实现所有数据库操作函数
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// ==================== 比赛操作 ====================

export async function getAllMatches() {
  const { data, error } = await supabase.from('matches').select('*').order('match_time', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getMatch(matchId) {
  const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (error) throw error;
  return data;
}

export async function upsertMatch(matchData) {
  const { data, error } = await supabase.from('matches').upsert(matchData, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}

export async function syncMatches(matchesData) {
  const currentIds = matchesData.map(m => m.id);
  const { data: existing } = await supabase.from('matches').select('id, weather, round_info, first_seen_state');
  const existingMap = new Map((existing || []).map(m => [m.id, m]));

  const enrichedData = matchesData.map(m => {
    const ex = existingMap.get(m.id);
    if (!ex) return { ...m, first_seen_state: m.latest_state_code };
    return {
      ...m,
      weather: m.weather || ex.weather || '',
      round_info: m.round_info || ex.round_info || '',
      first_seen_state: ex.first_seen_state ?? m.latest_state_code
    };
  });

  const { error: upsertError } = await supabase.from('matches').upsert(enrichedData, { onConflict: 'id' });
  if (upsertError) throw upsertError;

  const existingIds = (existing || []).map(m => m.id);
  const idsToDelete = existingIds.filter(id => !currentIds.includes(id));
  if (idsToDelete.length > 0) {
    const { data: snapMatches } = await supabase.from('snapshots').select('match_id').in('match_id', idsToDelete);
    const snapIds = new Set((snapMatches || []).map(s => s.match_id));
    const toDelete = idsToDelete.filter(id => !snapIds.has(id));
    if (toDelete.length > 0) await supabase.from('matches').delete().in('id', toDelete);
  }
  return matchesData.length;
}

export async function updateMatchField(matchId, field, value) {
  const { error } = await supabase.from('matches').update({ [field]: value }).eq('id', matchId);
  if (error) throw error;
}

export async function updateMatchHalftimeSnapshot(matchId, snapshotId) {
  await updateMatchField(matchId, 'halftime_snapshot_id', snapshotId);
}

export async function updateMatchMin60Snapshot(matchId, snapshotId) {
  await updateMatchField(matchId, 'min60_snapshot_id', snapshotId);
}

export async function updateMatchFulltimeSnapshot(matchId, snapshotId) {
  await updateMatchField(matchId, 'fulltime_snapshot_id', snapshotId);
}

export async function updateFirstSeenState(matchId, stateCode) {
  const { error } = await supabase.from('matches').update({ first_seen_state: stateCode })
    .eq('id', matchId).is('first_seen_state', null);
  if (error) throw error;
}

export async function getOrCreateMatch(matchId, sclassName, homeTeam, awayTeam, matchTime) {
  const existing = await getMatch(matchId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('matches').insert({
    id: matchId,
    sclass_name: sclassName || '',
    home_team: homeTeam || '',
    away_team: awayTeam || '',
    match_time: matchTime || '',
    latest_state_code: 0,
    latest_state_text: '未开始',
    created_at: now,
    latest_updated_at: now
  }).select().single();
  if (error) throw error;
  return data;
}

// ==================== 快照操作 ====================

export async function createSnapshot(snapshotData) {
  const { data, error } = await supabase.from('snapshots').insert(snapshotData).select().single();
  if (error) throw error;
  return data;
}

export async function getSnapshot(snapshotId) {
  const { data, error } = await supabase.from('snapshots').select('*').eq('id', snapshotId).single();
  if (error) throw error;
  return data;
}

export async function getSnapshotsByMatch(matchId) {
  const { data, error } = await supabase.from('snapshots').select('*').eq('match_id', matchId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getSnapshotByMatch(matchId, snapshotType) {
  let query = supabase.from('snapshots').select('*').eq('match_id', matchId);
  if (snapshotType) query = query.eq('snapshot_type', snapshotType);
  query = query.order('created_at', { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

export async function getFulltimeSnapshotCached(matchId) {
  return getSnapshotByMatch(matchId, 'fulltime');
}

// ==================== 报告操作 ====================

export async function createReport(reportData) {
  const { data, error } = await supabase.from('reports').insert(reportData).select().single();
  if (error) throw error;
  return data;
}

export async function getReports(matchId) {
  const { data, error } = await supabase.from('reports').select('*').eq('match_id', matchId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getReport(reportId) {
  const { data, error } = await supabase.from('reports').select('*').eq('id', reportId).single();
  if (error) throw error;
  return data;
}

export async function deleteReport(reportId) {
  const { error } = await supabase.from('reports').delete().eq('id', reportId);
  if (error) throw error;
}

// ==================== Storage 操作 ====================

export async function uploadReport(fileBuffer, fileName) {
  const { data, error } = await supabase.storage.from('reports').upload(fileName, fileBuffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (error) throw error;
  return data;
}

export async function getReportDownloadUrl(storagePath) {
  const { data, error } = await supabase.storage.from('reports').createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteReportFile(storagePath) {
  const { error } = await supabase.storage.from('reports').remove([storagePath]);
  if (error) throw error;
}
