/**
 * 报告生成模块 - 对应本地版 report_generator.py
 * 使用 docx 库生成 Word，然后转 PDF（网络版直接生成PDF）
 * 注意：Vercel 环境无 LibreOffice，因此网络版直接输出 docx 格式
 * 如需 PDF，可在前端通过 pdf-lib 转换，或使用外部转换服务
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
         WidthType, AlignmentType, ShadingType } from 'docx';
import { uploadReport } from './supabase_db.js';

function makeCell(text, options = {}) {
  const { bold = false, size = 18, align = AlignmentType.LEFT, shading = null } = options;
  const cellOpts = {
    children: [new Paragraph({
      alignment: align, spacing: { before: 20, after: 20 },
      children: [new TextRun({ text: String(text || ''), bold, size, font: '宋体' })],
    })],
  };
  if (shading) cellOpts.shading = { type: ShadingType.CLEAR, fill: shading };
  return new TableCell(cellOpts);
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => makeCell(h, { bold: true, size: 18, align: AlignmentType.CENTER, shading: '4472C4' })),
  });
  const dataRows = rows.map(row => new TableRow({ children: row.map(cell => makeCell(cell, { size: 18 })) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

function makeHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24, font: '微软雅黑' })],
  });
}

function makePara(text, options = {}) {
  const { size = 20, bold = false, align = AlignmentType.LEFT, color = null } = options;
  return new Paragraph({
    alignment: align, spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: String(text || ''), size, bold, font: '宋体', color })],
  });
}

function safeInt(v) { try { return parseInt(v) || 0; } catch { return 0; } }
function fmtTime(t) { return t && t.length >= 12 ? `${t.slice(8,10)}:${t.slice(10,12)}` : '--:--'; }
function fmtDate(t) { return t && t.length >= 8 ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}` : '--'; }
function tsToDate(ts) {
  if (!ts) return '';
  try { const d = new Date(parseInt(ts) * 1000); return d.toISOString().slice(0, 10); } catch { return ''; }
}

function genMatchInfo(doc, match, snapshot) {
  doc.addSection({ children: [
    makePara(`${match.home_team || ''} ${snapshot.home_score || 0} - ${snapshot.away_score || 0} ${match.away_team || ''}`, { size: 28, bold: true, align: AlignmentType.CENTER }),
    makePara(`半场比分: ${snapshot.home_half_score || 0} - ${snapshot.away_half_score || 0}  比赛状态: ${snapshot.state_text || ''}`, { size: 20, align: AlignmentType.CENTER }),
    makeTable(['项目','内容','项目','内容'], [
      ['联赛', `${match.sclass_name || ''} ${match.round_info || ''}`, '天气', match.weather || '暂无'],
      ['比赛时间', `${fmtDate(match.match_time)} ${fmtTime(match.match_time)}`, '比赛ID', String(match.id || '')],
      ['主队排名', String(match.home_rank || '暂无'), '客队排名', String(match.away_rank || '暂无')],
    ]),
  ]});
}

function genImportantEvents(doc, sjJson) {
  const events = (sjJson?.events?.eventList) || [];
  if (!events.length) { doc.addSection({ children: [makePara('暂无重要事件数据', { size: 18, color: '808080' })] }); return; }
  const rows = events.map(ev => {
    const minute = ev.time || '';
    const kind = ev.kind || '';
    let kindCn = '事件';
    if (ev.goalIn) kindCn = '进球';
    else if (ev.changePlayer) kindCn = '换人';
    else if (ev.yellowCard) kindCn = '黄牌';
    else if (ev.redCard) kindCn = '红牌';
    else if (ev.videoReferee) kindCn = 'VAR';
    else if (ev.process === 'HalfTime') kindCn = '中场';
    else if (ev.process === 'FullTime') kindCn = '完场';
    const homeVal = kind === 'HOME' ? kindCn : '';
    const awayVal = kind === 'AWAY' ? kindCn : '';
    let score = '';
    if (ev.goalIn) score = `${ev.goalIn.homeScore || 0}-${ev.goalIn.guestScore || 0}`;
    else if (ev.matchProcess) score = `${ev.matchProcess.homeScore || 0}-${ev.matchProcess.guestScore || 0}`;
    let desc = '';
    if (ev.goalIn) {
      const p = ev.goalIn.player?.name || ev.goalIn.player || '';
      const a = ev.goalIn.playerAssist?.name || ev.goalIn.playerAssist || '';
      desc = a ? `${p} 助攻:${a}` : p;
    }
    if (ev.changePlayer) {
      const on = ev.changePlayer.onPlayer?.name || '';
      const off = ev.changePlayer.offPlayer?.name || '';
      desc = `换上:${on} 换下:${off}`;
    }
    if (ev.yellowCard) desc = ev.yellowCard.player?.name || '';
    if (ev.redCard) desc = ev.redCard.player?.name || '';
    return [minute, kindCn, homeVal, awayVal, score, desc];
  });
  doc.addSection({ children: [makeTable(['时间','事件','主队','客队','比分','描述'], rows)] });
}

function genDetailedEvents(doc, sjJson) {
  const txtList = (sjJson?.eventTxt?.EventTxtLives) || [];
  if (!txtList.length) { doc.addSection({ children: [makePara('暂无详细事件数据', { size: 18, color: '808080' })] }); return; }
  const sorted = [...txtList].reverse();
  const rows = sorted.map(ev => {
    const time = ev.timeTxt || '';
    const stage = ev.matchState === 1 ? '上半场' : ev.matchState === 3 ? '下半场' : ev.matchState === -1 ? '完场' : '';
    const kindMap = { Start:'开赛', End:'结束', Goal:'进球', Yellow:'黄牌', Red:'红牌', Substitution:'换人', HalfTime:'中场' };
    const kindCn = kindMap[ev.kind] || ev.kind;
    const ctx = (ev.Context || '').replace(/<[^>]+>/g, '');
    return [time, stage, `[${kindCn}] ${ctx}`];
  });
  doc.addSection({ children: [makeTable(['时间','阶段','事件描述'], rows)] });
}

function genTechStats(doc, sjJson, snapshot) {
  const techStat = sjJson?.techStat || {};
  const itemList = techStat.itemList || [];
  if (!itemList.length) { doc.addSection({ children: [makePara('暂无技术统计数据', { size: 18, color: '808080' })] }); return; }
  const rows = itemList.map(item => {
    const home = item.home?.text || item.home?.value || '';
    const away = item.away?.text || item.away?.value || '';
    return [item.name || '', String(home), String(away)];
  });
  doc.addSection({ children: [makeTable(['统计项','主队','客队'], rows)] });

  const firstHalf = techStat.firstHalfList || [];
  if (firstHalf.length) {
    doc.addSection({ children: [makeHeading('上半场技术统计', HeadingLevel.HEADING_3)] });
    doc.addSection({ children: [makeTable(['统计项','主队','客队'], firstHalf.map(item => {
      const home = item.home?.text || item.home?.value || '';
      const away = item.away?.text || item.away?.value || '';
      return [item.name || '', String(home), String(away)];
    }))] });
  }
  const secondHalf = techStat.secondHalfList || [];
  if (secondHalf.length) {
    doc.addSection({ children: [makeHeading('下半场技术统计', HeadingLevel.HEADING_3)] });
    doc.addSection({ children: [makeTable(['统计项','主队','客队'], secondHalf.map(item => {
      const home = item.home?.text || item.home?.value || '';
      const away = item.away?.text || item.away?.value || '';
      return [item.name || '', String(home), String(away)];
    }))] });
  }
}

function genLineup(doc, sjJson, match) {
  const lineup = sjJson?.lineup || {};
  const homePlayers = lineup.homePlayerList || [];
  const awayPlayers = lineup.guestPlayerList || [];
  if (!homePlayers.length && !awayPlayers.length) {
    doc.addSection({ children: [makePara('暂无首发阵容数据', { size: 18, color: '808080' })] }); return;
  }
  const homeFormation = lineup.homeFormation || '';
  const awayFormation = lineup.guestFormation || '';
  if (homeFormation || awayFormation) {
    doc.addSection({ children: [makePara(`主队阵型: ${homeFormation}  客队阵型: ${awayFormation}`, { size: 20, bold: true })] });
  }
  const maxLen = Math.max(homePlayers.length, awayPlayers.length);
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    const h = homePlayers[i] || {};
    const a = awayPlayers[i] || {};
    rows.push([h.number || '', h.name || '', '', a.number || '', a.name || '']);
  }
  doc.addSection({ children: [makeTable(['号码', `${match.home_team || '主队'} 球员`, '位置', '号码', `${match.away_team || '客队'} 球员`], rows)] });
}

function genPlayerTech(doc, sjJson, match) {
  const playerTech = sjJson?.playerTech || {};
  const homeData = playerTech.homeTeamDatas || {};
  const awayData = playerTech.guestTeamDatas || {};
  const homePlayers = homeData.playerTechInfo || [];
  const awayPlayers = awayData.playerTechInfo || [];
  const titles = (playerTech.titles || []).map(t => t.infoTitle);
  if (!homePlayers.length && !awayPlayers.length) {
    doc.addSection({ children: [makePara('暂无球员技术统计数据', { size: 18, color: '808080' })] }); return;
  }
  function makePlayerTable(players, teamName) {
    if (!players.length) return;
    doc.addSection({ children: [makePara(`${teamName} 球员:`, { size: 20, bold: true })] });
    const headers = ['号码', '球员', ...titles];
    const rows = players.map(p => {
      const techMap = {};
      (p.techInfos || []).forEach(t => { techMap[t.infoKind] = t.infoValue; });
      return [p.playerNum || '', p.playerName || '', ...titles.map((_, i) => techMap[Object.keys(techMap)[i]] || '')];
    });
    doc.addSection({ children: [makeTable(headers, rows)] });
  }
  makePlayerTable(homePlayers, match.home_team || '主队');
  makePlayerTable(awayPlayers, match.away_team || '客队');
}

function genLeaguePoints(doc, anJson, match) {
  const cp = anJson?.currentPoints || {};
  const homePts = cp.homePoints || {};
  const awayPts = cp.awayPoints || {};
  if (!homePts.points && !awayPts.points) {
    doc.addSection({ children: [makePara('暂无联赛积分排名数据', { size: 18, color: '808080' })] }); return;
  }
  function makePointsTable(ptsData, teamName) {
    const points = ptsData.points || [];
    if (!points.length) return;
    doc.addSection({ children: [makePara(`${ptsData.teamName || teamName} 积分排名:`, { size: 20, bold: true })] });
    const rows = points.map(p => {
      let winScale = p.winScale;
      try { winScale = `${parseFloat(p.winScale).toFixed(2)}%`; } catch {}
      return [p.name || '', String(p.total || ''), String(p.win || ''), String(p.draw || ''), String(p.loss || ''),
              String(p.getGoal || ''), String(p.lossGoal || ''), String(p.netGoal || ''), String(p.point || ''),
              String(p.rank || ''), winScale];
    });
    doc.addSection({ children: [makeTable(['类型','场次','胜','平','负','进球','失球','净胜','积分','排名','胜率'], rows)] });
  }
  makePointsTable(homePts, match.home_team || '主队');
  makePointsTable(awayPts, match.away_team || '客队');
}

function genLeagueRanking(doc, anJson, match) {
  const cls = anJson?.curLeagueStat || {};
  const itemList = cls.itemList || [];
  if (!itemList.length) { doc.addSection({ children: [makePara('暂无联赛排名统计数据', { size: 18, color: '808080' })] }); return; }
  const rows = itemList.map(item => [item.title || '', String(item.homeValue || ''), String(item.awayValue || '')]);
  doc.addSection({ children: [makeTable(['统计项', match.home_team || '主队', match.away_team || '客队'], rows)] });
}

function genH2H(doc, anJson, match) {
  const vs = anJson?.vsMatches || {};
  const matches = vs.matches || [];
  if (!matches.length) { doc.addSection({ children: [makePara('暂无交锋历史数据', { size: 18, color: '808080' })] }); return; }
  let homeWin = 0, draw = 0, awayWin = 0;
  for (const m of matches) {
    const hs = m.homeTeam?.score || 0, as = m.awayTeam?.score || 0;
    if (hs > as) homeWin++; else if (hs < as) awayWin++; else draw++;
  }
  doc.addSection({ children: [makePara(`近 ${matches.length} 场交锋: ${match.home_team || '主队'} 胜 ${homeWin} 场, 平 ${draw} 场, ${match.away_team || '客队'} 胜 ${awayWin} 场`, { size: 20, bold: true })] });
  const rows = matches.slice(0, 20).map(m => {
    const mt = m.matchTime || '';
    const date = mt && /^\d+$/.test(mt) ? tsToDate(mt) : '';
    return [date, m.leagueName || '', m.homeTeam?.name || '', `${m.homeTeam?.score || ''}-${m.awayTeam?.score || ''}`, m.awayTeam?.name || '', `${m.homeTeam?.halfScore || ''}-${m.awayTeam?.halfScore || ''}`];
  });
  doc.addSection({ children: [makeTable(['日期','赛事','主队','比分','客队','半场'], rows)] });
}

function genRecentForm(doc, anJson, match) {
  const nm = anJson?.nearMatches || {};
  const homeData = nm.homeMatches || {};
  const awayData = nm.awayMatches || {};
  const homeMatches = homeData.matches || [];
  const awayMatches = awayData.matches || [];
  if (!homeMatches.length && !awayMatches.length) {
    doc.addSection({ children: [makePara('暂无近期战绩数据', { size: 18, color: '808080' })] }); return;
  }
  function makeFormTable(matches, teamName) {
    if (!matches.length) return;
    doc.addSection({ children: [makePara(`${teamName} 近期战绩:`, { size: 20, bold: true })] });
    const rows = matches.slice(0, 15).map(m => {
      const mt = m.matchTime || '';
      const date = mt && /^\d+$/.test(mt) ? tsToDate(mt) : '';
      return [date, m.leagueName || '', m.homeTeam?.name || '', `${m.homeTeam?.score || ''}-${m.awayTeam?.score || ''}`, m.awayTeam?.name || '', `${m.homeTeam?.halfScore || ''}-${m.awayTeam?.halfScore || ''}`];
    });
    doc.addSection({ children: [makeTable(['日期','赛事','主队','比分','客队','半场'], rows)] });
  }
  makeFormTable(homeMatches, match.home_team || '主队');
  makeFormTable(awayMatches, match.away_team || '客队');
}

function genGoalDistribution(doc, sjJson, match) {
  const jsq = sjJson?.jsq || {};
  const jsqList = jsq.jsqList || [];
  if (!jsqList.length) { doc.addSection({ children: [makePara('暂无进失球时间分布数据', { size: 18, color: '808080' })] }); return; }
  let count30 = jsqList.find(c => c.count === 'Count_30') || jsqList[0];
  const homeInfo = count30.jsqInfoHome || [];
  const awayInfo = count30.jsqInfoGuest || [];
  const periods = ['1-15分钟', '16-30分钟', '31-45分钟', '46-60分钟', '61-75分钟', '76-90分钟'];
  const rows = periods.map((period, i) => {
    const h = homeInfo[i] || {};
    const a = awayInfo[i] || {};
    return [period, h.JQ || '', h.SQ || '', a.JQ || '', a.SQ || ''];
  });
  doc.addSection({ children: [makeTable(['时间段', `${match.home_team || '主队'} 进球`, `${match.home_team || '主队'} 失球`, `${match.away_team || '客队'} 进球`, `${match.away_team || '客队'} 失球`], rows)] });
}

function genHalfFull(doc, sjJson, match) {
  const allhalf = sjJson?.allhalf || {};
  const halfList = allhalf.list || [];
  if (!halfList.length) { doc.addSection({ children: [makePara('暂无半场/全场统计数据', { size: 18, color: '808080' })] }); return; }
  const typeMap = { 'HA33': '半胜/全胜', 'HA13': '半平/全胜', 'HA03': '半负/全胜', 'HA31': '半胜/全平', 'HA11': '半平/全平', 'HA01': '半负/全平', 'HA30': '半胜/全负', 'HA10': '半平/全负', 'HA00': '半负/全负' };
  const rows = halfList.map(h => [typeMap[h.type] || h.type, String(h.halfHome || 0), String(h.allHome || 0), String(h.halfGuest || 0), String(h.allGuest || 0)]);
  doc.addSection({ children: [makeTable(['半场/全场', `${match.home_team || '主队'} 半场`, `${match.home_team || '主队'} 全场`, `${match.away_team || '客队'} 半场`, `${match.away_team || '客队'} 全场`], rows)] });
}

function genFutureMatches(doc, anJson, match) {
  const fm = anJson?.future3Matches || {};
  const homeData = fm.homeMatches || {};
  const awayData = fm.awayMatches || {};
  const homeFuture = homeData.matches || [];
  const awayFuture = awayData.matches || [];
  if (!homeFuture.length && !awayFuture.length) {
    doc.addSection({ children: [makePara('暂无未来比赛数据', { size: 18, color: '808080' })] }); return;
  }
  function makeFutureTable(matches, teamName) {
    if (!matches.length) return;
    doc.addSection({ children: [makePara(`${teamName} 未来3场:`, { size: 20, bold: true })] });
    const rows = matches.slice(0, 3).map(m => {
      const mt = m.matchTime || '';
      const date = mt && /^\d+$/.test(mt) ? tsToDate(mt) : '';
      const ht = typeof m.homeTeam === 'string' ? m.homeTeam : (m.homeTeam?.name || '');
      const at = typeof m.awayTeam === 'string' ? m.awayTeam : (m.awayTeam?.name || '');
      return [date, m.leagueName || '', ht, at];
    });
    doc.addSection({ children: [makeTable(['日期','赛事','主队','客队'], rows)] });
  }
  makeFutureTable(homeFuture, match.home_team || '主队');
  makeFutureTable(awayFuture, match.away_team || '客队');
}

function genInjury(doc, anJson, match) {
  const injury = anJson?.injury || {};
  const homeInjury = injury.homeInjury || [];
  const awayInjury = injury.awayInjury || [];
  if (!homeInjury.length && !awayInjury.length) {
    doc.addSection({ children: [makePara('暂无伤病信息数据', { size: 18, color: '808080' })] }); return;
  }
  function makeInjuryTable(players, teamName) {
    if (!players.length) return;
    doc.addSection({ children: [makePara(`${teamName} 伤病:`, { size: 20, bold: true })] });
    const rows = players.map(p => {
      const name = typeof p.name === 'object' ? (p.name?.cn || '') : (p.name || '');
      const pos = typeof p.position === 'object' ? (p.position?.cn || '') : (p.position || '');
      const reason = p.reason || p.injuryReson || '';
      return [name, pos, reason, p.status || ''];
    });
    doc.addSection({ children: [makeTable(['球员','位置','伤病原因','状态'], rows)] });
  }
  makeInjuryTable(homeInjury, match.home_team || '主队');
  makeInjuryTable(awayInjury, match.away_team || '客队');
}

function genReferee(doc, anJson, match) {
  const referee = anJson?.referee || {};
  if (!referee || !referee.referee) { doc.addSection({ children: [makePara('暂无裁判信息数据', { size: 18, color: '808080' })] }); return; }
  const refInfo = referee.referee || {};
  const refName = typeof refInfo.name === 'object' ? (refInfo.name?.cn || '') : (refInfo.name || '');
  const matchScale = referee.matchScale || {};
  const avgYellow = referee.avgYellow || {};
  const homeStat = referee.homeStatistics || {};
  const awayStat = referee.awayStatistics || {};
  const rows = [
    ['裁判姓名', refName, '执法场次', String(matchScale.near || '')],
    ['场均黄牌', String(avgYellow.avgNumber || ''), '', ''],
  ];
  if (homeStat || awayStat) {
    const homeStr = homeStat ? `胜${homeStat.win||0} 平${homeStat.draw||0} 负${homeStat.loss||0}` : '';
    const awayStr = awayStat ? `胜${awayStat.win||0} 平${awayStat.draw||0} 负${awayStat.loss||0}` : '';
    rows.push(['主队执法', homeStr, '客队执法', awayStr]);
  }
  doc.addSection({ children: [makeTable(['项目','内容','项目','内容'], rows)] });
}

function genTransfer(doc, anJson, match) {
  const transfer = anJson?.transfer || {};
  const homeTransfer = transfer.homeList || transfer.homeTransfer || [];
  const awayTransfer = transfer.guestList || transfer.awayTransfer || [];
  if (!homeTransfer.length && !awayTransfer.length) {
    doc.addSection({ children: [makePara('暂无转会信息数据', { size: 18, color: '808080' })] }); return;
  }
  function makeTransferTable(transfers, teamName) {
    if (!transfers.length) return;
    doc.addSection({ children: [makePara(`${teamName} 转会信息:`, { size: 20, bold: true })] });
    const rows = transfers.map(t => {
      const playerName = typeof t.playerName === 'object' ? (t.playerName?.cn || '') : (t.playerName || '');
      return [playerName, t.transferType || '', t.clubName || '', t.transferFee || ''];
    });
    doc.addSection({ children: [makeTable(['球员','转入/转出','对方俱乐部','转会费'], rows)] });
  }
  makeTransferTable(homeTransfer, match.home_team || '主队');
  makeTransferTable(awayTransfer, match.away_team || '客队');
}

function genMatchFeature(doc, anJson, match) {
  const mf = anJson?.matchFeature || {};
  const features = mf.features || [];
  if (!features.length) { doc.addSection({ children: [makePara('暂无比赛特征数据', { size: 18, color: '808080' })] }); return; }
  const homeFeatures = {}, awayFeatures = {};
  for (const f of features) {
    const title = f.title || '';
    if (!title) continue;
    const win = f.win || '', draw = f.draw || '', loss = f.loss || '';
    if (win === '胜' && draw === '平' && loss === '负') continue;
    const record = `胜${win} 平${draw} 负${loss}`;
    if (title.includes('主队')) homeFeatures[title.replace('主队', '').trim()] = record;
    else if (title.includes('客队')) awayFeatures[title.replace('客队', '').trim()] = record;
  }
  const allSubTitles = [...new Set([...Object.keys(homeFeatures), ...Object.keys(awayFeatures)])];
  if (!allSubTitles.length) { doc.addSection({ children: [makePara('暂无比赛特征数据', { size: 18, color: '808080' })] }); return; }
  const rows = allSubTitles.map(st => [st, homeFeatures[st] || '', awayFeatures[st] || '']);
  doc.addSection({ children: [makeTable(['特征项', match.home_team || '主队', match.away_team || '客队'], rows)] });
}

function genTeamTech(doc, anJson, match) {
  const mts = anJson?.matchTechStatistic || {};
  const itemList = mts.itemList || [];
  if (!itemList.length) { doc.addSection({ children: [makePara('暂无球队技术统计数据', { size: 18, color: '808080' })] }); return; }
  const rows = itemList.map(item => [item.title || item.name || '', String(item.homeValue || ''), String(item.awayValue || '')]);
  doc.addSection({ children: [makeTable(['统计项', match.home_team || '主队', match.away_team || '客队'], rows)] });
}

export async function generateReport(match, snapshot, sjJson, anJson, reportType) {
  const doc = new Document({ sections: [] });

  // 封面
  doc.addSection({ children: [
    makePara(`${match.sclass_name || ''} ${match.home_team || ''} vs ${match.away_team || ''}`, { size: 32, bold: true, align: AlignmentType.CENTER }),
    makePara('比赛分析报告', { size: 24, align: AlignmentType.CENTER }),
    makePara(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, { size: 18, align: AlignmentType.CENTER, color: '808080' }),
  ]});

  // 第一部分
  doc.addSection({ children: [makeHeading('第一部分  比赛赛况', HeadingLevel.HEADING_1)] });
  doc.addSection({ children: [makeHeading('一、比赛基本信息', HeadingLevel.HEADING_2)] });
  genMatchInfo(doc, match, snapshot);
  doc.addSection({ children: [makeHeading('二、重要事件', HeadingLevel.HEADING_2)] });
  genImportantEvents(doc, sjJson);
  doc.addSection({ children: [makeHeading('三、详细事件', HeadingLevel.HEADING_2)] });
  genDetailedEvents(doc, sjJson);
  doc.addSection({ children: [makeHeading('四、技术统计', HeadingLevel.HEADING_2)] });
  genTechStats(doc, sjJson, snapshot);
  doc.addSection({ children: [makeHeading('五、首发阵容', HeadingLevel.HEADING_2)] });
  genLineup(doc, sjJson, match);
  doc.addSection({ children: [makeHeading('六、球员技术统计', HeadingLevel.HEADING_2)] });
  genPlayerTech(doc, sjJson, match);
  doc.addSection({ children: [makeHeading('七、联赛积分排名', HeadingLevel.HEADING_2)] });
  genLeaguePoints(doc, anJson, match);
  doc.addSection({ children: [makeHeading('八、联赛排名统计', HeadingLevel.HEADING_2)] });
  genLeagueRanking(doc, anJson, match);

  // 第二部分
  doc.addSection({ children: [makeHeading('第二部分  对战球队信息', HeadingLevel.HEADING_1)] });
  doc.addSection({ children: [makeHeading('一、交锋历史', HeadingLevel.HEADING_2)] });
  genH2H(doc, anJson, match);
  doc.addSection({ children: [makeHeading('二、近期战绩', HeadingLevel.HEADING_2)] });
  genRecentForm(doc, anJson, match);
  doc.addSection({ children: [makeHeading('三、近30场进失球时间分布', HeadingLevel.HEADING_2)] });
  genGoalDistribution(doc, sjJson, match);
  doc.addSection({ children: [makeHeading('四、近两赛季半场/全场统计', HeadingLevel.HEADING_2)] });
  genHalfFull(doc, sjJson, match);
  doc.addSection({ children: [makeHeading('五、未来3场比赛', HeadingLevel.HEADING_2)] });
  genFutureMatches(doc, anJson, match);
  doc.addSection({ children: [makeHeading('六、伤病信息', HeadingLevel.HEADING_2)] });
  genInjury(doc, anJson, match);
  doc.addSection({ children: [makeHeading('七、裁判信息', HeadingLevel.HEADING_2)] });
  genReferee(doc, anJson, match);
  doc.addSection({ children: [makeHeading('八、转会信息', HeadingLevel.HEADING_2)] });
  genTransfer(doc, anJson, match);
  doc.addSection({ children: [makeHeading('九、比赛特征', HeadingLevel.HEADING_2)] });
  genMatchFeature(doc, anJson, match);
  doc.addSection({ children: [makeHeading('十、球队技术统计', HeadingLevel.HEADING_2)] });
  genTeamTech(doc, anJson, match);

  // 文件名
  const league = match.sclass_name || '未知联赛';
  const homeTeam = match.home_team || '主队';
  const awayTeam = match.away_team || '客队';
  let status = reportType;
  if (reportType === 'fulltime') status = '完场';
  else if (reportType === 'halftime') status = '中场';
  else if (reportType === 'min60') status = `${snapshot.elapsed_min || 60}分钟`;
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const ts = now.toISOString().slice(0, 12).replace(/[-T:]/g, '');
  const fileName = `${league}_${match.id}_${homeTeam}v${awayTeam}_${status}_${ts}.docx`.replace(/[<>:"/\\|?*]/g, '');

  const buffer = await Packer.toBuffer(doc);
  const storagePath = `${match.id}/${fileName}`;
  await uploadReport(buffer, storagePath);

  return { fileName, storagePath, buffer };
}
