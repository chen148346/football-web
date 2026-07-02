'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Head from 'next/head';

// 1. 将原有的组件逻辑重命名为 MatchDetailContent
function MatchDetailContent() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get('id');
  const [match, setMatch] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (matchId) loadData();
  }, [matchId]);

  const loadData = async () => {
    try {
      const [m, s, r] = await Promise.all([
        fetch(`/api/match-detail?id=${matchId}`).then(r => r.json()),
        fetch(`/api/snapshots-list?id=${matchId}`).then(r => r.json()),
        fetch(`/api/reports-list?id=${matchId}`).then(r => r.json()),
      ]);
      if (m.success) setMatch(m.match);
      if (s.success) setSnapshots(s.snapshots);
      if (r.success) setReports(r.reports);
    } catch (e) { console.error('加载失败:', e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (!match) return <div className="loading">比赛不存在</div>;

  return (
    <>
      <Head><title>{match.home_team} vs {match.away_team}</title></Head>
      <div className="header">
        <a href="/" className="back-link">← 返回列表</a>
        <h1>{match.sclass_name} {match.home_team} vs {match.away_team}</h1>
      </div>
      <div className="container">
        <div className="match-card">
          <div className="match-info">
            <div className="team-name">{match.home_team}</div>
            <div className="score-display">{match.latest_home_score} - {match.latest_away_score}</div>
            <div className="team-name">{match.away_team}</div>
          </div>
          <div className="match-meta">
            <div>半场比分: {match.latest_home_half_score} - {match.latest_away_half_score}</div>
            <div>状态: {match.latest_state_display}</div>
            <div>天气: {match.weather || '暂无'}</div>
            <div>轮次: {match.round_info || '暂无'}</div>
          </div>
        </div>
        <div className="section">
          <h2>快照列表</h2>
          {snapshots.length === 0 ? <div className="empty">暂无快照</div> :
            <table>
              <thead><tr><th>ID</th><th>类型</th><th>状态</th><th>比分</th><th>时间</th></tr></thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.snapshot_type}</td>
                    <td>{s.state_text}</td>
                    <td>{s.home_score} - {s.away_score}</td>
                    <td>{s.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
        <div className="section">
          <h2>报告列表</h2>
          {reports.length === 0 ? <div className="empty">暂无报告</div> :
            <table>
              <thead><tr><th>ID</th><th>类型</th><th>文件名</th><th>时间</th><th>操作</th></tr></thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.report_type}</td>
                    <td>{r.file_name}</td>
                    <td>{r.created_at}</td>
                    <td><a href={`/api/download-report?id=${r.id}`} className="download-btn">下载</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      </div>
      <style jsx>{`
        .header { background: linear-gradient(135deg, #1a5276, #2e86c1); color: white; padding: 18px 30px; }
        .back-link { color: white; text-decoration: none; font-size: 13px; }
        .header h1 { font-size: 20px; margin-top: 5px; }
        .container { max-width: 900px; margin: 20px auto; padding: 0 20px; }
        .match-card { background: white; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
        .match-info { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; text-align: center; gap: 20px; }
        .team-name { font-size: 20px; font-weight: 700; }
        .score-display { font-size: 36px; font-weight: 700; color: #2c3e50; }
        .match-meta { margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; color: #666; }
        .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .section h2 { font-size: 18px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { background: #f5f6fa; font-weight: 600; }
        .empty { text-align: center; color: #999; padding: 20px; }
        .download-btn { color: #3498db; text-decoration: none; }
        .loading { text-align: center; padding: 60px; color: #2e86c1; }
      `}</style>
    </>
  );
}

// 2. 导出默认组件，使用 Suspense 包裹
export default function MatchDetail() {
  return (
    <Suspense fallback={<div style={{padding: '60px', textAlign: 'center', color: '#2e86c1'}}>加载中...</div>}>
      <MatchDetailContent />
    </Suspense>
  );
}
