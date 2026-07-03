'use client';
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [sclassList, setSclassList] = useState([]);
  const [sclassFilter, setSclassFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportLoading, setReportLoading] = useState({});

  const loadMatches = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sclassFilter) params.set('sclass', sclassFilter);
      if (stateFilter) params.set('state', stateFilter);
      const resp = await fetch(`/api/matches?${params}`);
      const data = await resp.json();
      if (data.success) { setMatches(data.matches); setSclassList(data.sclassList); }
    } catch (e) { console.error('加载失败:', e); }
    finally { setLoading(false); }
  }, [sclassFilter, stateFilter]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/refresh', { method: 'POST' });
      await loadMatches();
    } catch (e) { alert('刷新失败: ' + e.message); }
    finally { setRefreshing(false); }
  };

  const quickReport = async (e, matchId) => {
    e.preventDefault(); e.stopPropagation();
    setReportLoading(prev => ({ ...prev, [matchId]: 'report' }));
    try {
      const resp = await fetch(`/api/quick-report?id=${matchId}`, { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        alert(`报告生成成功: ${data.fileName}\n\n下载链接: ${window.location.origin}/api/download-report?id=${data.reportId || ''}\n\n或前往比赛详情页下载。`);
        loadMatches();
      }
      else { alert('生成失败: ' + data.error); }
    } catch (e) { alert('请求失败: ' + e.message); }
    finally { setReportLoading(prev => { const n = {...prev}; delete n[matchId]; return n; }); }
  };

  const teamReport = async (e, matchId) => {
    e.preventDefault(); e.stopPropagation();
    setReportLoading(prev => ({ ...prev, [matchId]: 'team' }));
    try {
      const resp = await fetch(`/api/team-report?id=${matchId}`, { method: 'POST' });
      const data = await resp.json();
      if (data.success) { alert(`赛况报告生成成功！\n主队: ${data.home_team} (${data.home_count}场)\n客队: ${data.away_team} (${data.away_count}场)`); }
      else { alert('生成失败: ' + data.error); }
    } catch (e) { alert('请求失败: ' + e.message); }
    finally { setReportLoading(prev => { const n = {...prev}; delete n[matchId]; return n; }); }
  };

  const batchImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(`确认导入文件: ${file.name}？\n系统将为每个完场比赛生成快照和报告，可能需要较长时间。`)) { e.target.value = ''; return; }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch('/api/batch-import', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        const r = data.result;
        let msg = `批量导入完成！\n总计: ${r.total}\n成功: ${r.success}\n不存在: ${r.skipped_not_exist}\n未完场: ${r.skipped_not_finished}\n出错: ${r.skipped_error}`;
        // 列出成功生成的报告及下载链接
        const successResults = r.results.filter(x => x.status === 'success' && x.report_id);
        if (successResults.length > 0) {
          msg += '\n\n成功生成的报告（点击下载）：';
          successResults.forEach(x => {
            msg += `\n• ${x.file_name}\n  下载链接: ${window.location.origin}/api/download-report?id=${x.report_id}`;
          });
        }
        alert(msg);
        loadMatches();
      } else { alert('导入失败: ' + data.error); }
    } catch (e) { alert('请求失败: ' + e.message); }
    finally { e.target.value = ''; }
  };

  const getStateClass = (sc) => {
    if ([1,3,4].includes(sc)) return 'state-live';
    if (sc === 2) return 'state-halftime';
    if (sc === 0) return 'state-upcoming';
    if (sc === -1) return 'state-finished';
    return 'state-other';
  };

  const formatTime = (mt) => mt && mt.length >= 12 ? `${mt.slice(8,10)}:${mt.slice(10,12)}` : '--:--';
  const formatDate = (mt) => mt && mt.length >= 8 ? `${mt.slice(4,6)}-${mt.slice(6,8)}` : '--';

  return (
    <>
      <Head><title>足球比赛数据文档分析系统</title></Head>
      <div className="header">
        <h1>⚽ 足球比赛数据文档分析系统</h1>
        <div className="subtitle">实时比赛数据监控 · 手动快照 · 智能报告生成</div>
      </div>
      <div className="container">
        <div className="toolbar">
          <label>联赛筛选:</label>
          <select value={sclassFilter} onChange={(e) => setSclassFilter(e.target.value)}>
            <option value="">全部联赛</option>
            {sclassList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label>状态筛选:</label>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="live">进行中</option>
            <option value="upcoming">未开始</option>
            <option value="finished">已完场</option>
            <option value="other">其他</option>
          </select>
          <button onClick={handleRefresh} disabled={refreshing}>{refreshing ? '刷新中...' : '🔄 刷新数据'}</button>
          <button onClick={() => document.getElementById('batchFile').click()} style={{background:'#27ae60'}}>📁 批量导入</button>
          <input type="file" id="batchFile" accept=".txt" style={{display:'none'}} onChange={batchImport} />
          <div className="info">共 {matches.length} 场比赛</div>
        </div>
        <div className="match-list">
          <div className="match-row header-row">
            <div>联赛</div><div>时间</div><div>主队</div><div>比分</div><div>客队</div><div>状态</div><div>操作</div>
          </div>
          {loading ? <div className="empty">加载中...</div> :
           matches.length === 0 ? <div className="empty">暂无比赛数据，请点击"刷新数据"</div> :
           matches.map(m => (
            <a key={m.id} href={`/match-detail?id=${m.id}`} className="match-row">
              <div><span className="sclass-badge" style={{background: m.sclass_color || '#2e86c1'}}>{m.sclass_name}</span></div>
              <div><div className="match-time">{formatTime(m.match_time)}</div><div className="match-date">{formatDate(m.match_time)}</div></div>
              <div className="team">{m.home_team}{m.home_rank ? `[${m.home_rank}]` : ''}</div>
              <div className="score">{m.home_score} - {m.away_score}{m.home_half_score != null && <div className="half">半场 {m.home_half_score}-{m.away_half_score}</div>}</div>
              <div className="team">{m.away_team}{m.away_rank ? `[${m.away_rank}]` : ''}</div>
              <div><span className={`state ${getStateClass(m.state_code)}`}>{m.state_display}</span></div>
              <div>
                <button className="quick-report-btn" onClick={(e) => quickReport(e, m.id)} disabled={reportLoading[m.id]}>
                  {reportLoading[m.id] === 'report' ? '生成中...' : '报告'}
                </button>
                <button className="team-report-btn" onClick={(e) => teamReport(e, m.id)} disabled={reportLoading[m.id]}>
                  {reportLoading[m.id] === 'team' ? '生成中...' : '赛况'}
                </button>
              </div>
            </a>
          ))}
        </div>
      </div>
      <style jsx>{`
        .header { background: linear-gradient(135deg, #1a5276, #2e86c1); color: white; padding: 18px 30px; }
        .header h1 { font-size: 22px; margin-bottom: 4px; }
        .header .subtitle { font-size: 13px; opacity: 0.85; }
        .container { max-width: 1400px; margin: 20px auto; padding: 0 20px; }
        .toolbar { background: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .toolbar select, .toolbar button { padding: 7px 16px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
        .toolbar button { background: #2e86c1; color: white; border: none; cursor: pointer; }
        .toolbar button:disabled { background: #95a5a6; }
        .match-list { background: white; border-radius: 8px; overflow: hidden; }
        .match-row { display: grid; grid-template-columns: 1.5fr 0.8fr 2fr 1fr 2fr 1fr 1.5fr; gap: 8px; padding: 10px 15px; border-bottom: 1px solid #eee; text-decoration: none; color: inherit; align-items: center; }
        .match-row:hover { background: #f5f6fa; }
        .header-row { background: #f0f2f5; font-weight: 600; font-size: 13px; }
        .sclass-badge { display: inline-block; padding: 3px 8px; border-radius: 3px; color: white; font-size: 12px; }
        .match-time { font-weight: 600; font-size: 15px; }
        .match-date { font-size: 11px; color: #999; }
        .team { font-size: 14px; }
        .score { font-size: 18px; font-weight: 700; text-align: center; }
        .half { font-size: 11px; color: #999; font-weight: normal; }
        .state { display: inline-block; padding: 3px 8px; border-radius: 3px; font-weight: 600; font-size: 12px; }
        .state-live { background: #e74c3c; color: white; }
        .state-halftime { background: #f39c12; color: white; }
        .state-upcoming { background: #3498db; color: white; }
        .state-finished { background: #95a5a6; color: white; }
        .state-other { background: #bdc3c7; color: #555; }
        .quick-report-btn, .team-report-btn { padding: 4px 10px; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; margin-left: 3px; }
        .quick-report-btn { background: #3498db; }
        .team-report-btn { background: #9b59b6; }
        .quick-report-btn:disabled, .team-report-btn:disabled { background: #95a5a6; }
        .empty { text-align: center; padding: 60px 20px; color: #999; }
        .info { margin-left: auto; font-size: 13px; color: #666; }
      `}</style>
    </>
  );
}
