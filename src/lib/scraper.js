/**
 * 数据抓取模块 - 对应本地版 scraper.py
 */
import { TITAN007_BASE, getRandomHeaders, REQUEST_TIMEOUT, REQUEST_RETRIES,
         REQUEST_DELAY_MIN, REQUEST_DELAY_MAX, ODDS_JSON_KEYS } from './config.js';
import { getServerTime, extractHeadStartTime, estimateElapsedMin } from './match_time_calc.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchUrl(url, retries = REQUEST_RETRIES) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: getRandomHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      const text = await resp.text();
      await sleep(REQUEST_DELAY_MIN + Math.random() * (REQUEST_DELAY_MAX - REQUEST_DELAY_MIN));
      return text;
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  throw lastErr;
}

function filterOdds(obj) {
  if (Array.isArray(obj)) return obj.map(filterOdds);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!ODDS_JSON_KEYS.has(k) && !['letgoal', 'ou', 'odds'].includes(k)) {
        result[k] = filterOdds(v);
      }
    }
    return result;
  }
  return obj;
}

function extractJsonData(html) {
  const patterns = [
    /var\s+jsonData\s*=\s*(\{.*?\});\s*<\/script>/s,
    /var\s+jsonData\s*=\s*(\{.*?\});\s*$/ms,
    /jsonData\s*=\s*(\{.*?\});\s*<\/script>/s,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      try { return JSON.parse(m[1]); } catch (e) {}
    }
  }
  return null;
}

export async function fetchScheduleForDate(dateStr) {
  const url = `${TITAN007_BASE}/Schedule.htm?date=${dateStr}`;
  const html = await fetchUrl(url);
  const m = html.match(/scheduleDataStr\s*=\s*"([^"]*)"/);
  const scheduleStr = m ? m[1] : '';
  const m2 = html.match(/sclassDataStr\s*=\s*"([^"]*)"/);
  const sclassStr = m2 ? m2[1] : '';

  const sclassMap = {};
  for (const part of sclassStr.split('$')) {
    for (const entry of part.split('!')) {
      if (!entry) continue;
      const fields = entry.split('^');
      if (fields.length >= 2) {
        sclassMap[fields[1]] = { name: fields[0], color: fields[4] || '' };
      }
    }
  }

  const serverTime = await getServerTime();
  const matches = [];
  const liveMatchIds = [];
  const parsedRecords = [];

  for (const rec of scheduleStr.split('!')) {
    if (!rec) continue;
    const fields = rec.split('^');
    if (fields.length < 22) continue;
    parsedRecords.push(fields);
    const stateCode = parseInt(fields[2]);
    if ([1, 3].includes(stateCode)) liveMatchIds.push(parseInt(fields[0]));
  }

  // 获取进行中比赛的headStartTime
  const headStartTimes = {};
  for (const mid of liveMatchIds) {
    try {
      const shijianHtml = await fetchUrl(`${TITAN007_BASE}/Analy/ShiJian/${mid}.htm`);
      const hst = extractHeadStartTime(shijianHtml);
      if (hst) headStartTimes[mid] = hst;
    } catch (e) {}
  }

  for (const fields of parsedRecords) {
    try {
      const matchId = parseInt(fields[0]);
      const sclassId = fields[1];
      const stateCode = parseInt(fields[2]);
      const matchTimeStr = fields[3];
      const sclassInfo = sclassMap[sclassId] || { name: '', color: '' };

      let elapsedMin = 0;
      const hst = headStartTimes[matchId];
      if (hst && [1, 3].includes(stateCode)) {
        const df = Math.floor((serverTime - hst) / 60000);
        if (stateCode === 1) elapsedMin = df <= 0 ? 1 : df;
        else elapsedMin = Math.max(46, df + 46);
      } else {
        elapsedMin = estimateElapsedMin(stateCode, matchTimeStr, serverTime);
      }

      let stateDisplay = '';
      if ([1, 3, 4].includes(stateCode) && elapsedMin > 0) {
        if (stateCode === 1) stateDisplay = elapsedMin <= 45 ? `${elapsedMin}'` : `45+${elapsedMin - 45}'`;
        else if (stateCode === 3) stateDisplay = elapsedMin <= 90 ? `${elapsedMin}'` : `90+${elapsedMin - 90}'`;
        else stateDisplay = `${elapsedMin}'`;
      } else {
        stateDisplay = { '-1': '完场', '0': 'VS', '2': '中场', '4': '加时' }[stateCode] || '';
      }

      const safeInt = (v) => { try { return parseInt(v) || 0; } catch { return 0; } };

      matches.push({
        id: matchId, sclass_id: sclassId, sclass_name: sclassInfo.name,
        sclass_color: sclassInfo.color, match_time: matchTimeStr,
        match_date: matchTimeStr.slice(0, 8) ? `${matchTimeStr.slice(0,4)}-${matchTimeStr.slice(4,6)}-${matchTimeStr.slice(6,8)}` : '',
        home_team: fields[5], away_team: fields[6],
        home_rank: safeInt(fields[19]), away_rank: safeInt(fields[20]),
        latest_state_code: stateCode,
        latest_state_text: { '-1': '完场', '0': '未开始', '1': '上半场', '2': '中场', '3': '下半场', '4': '加时' }[stateCode] || '未知',
        latest_state_display: stateDisplay,
        latest_home_score: safeInt(fields[7]), latest_away_score: safeInt(fields[8]),
        latest_home_half_score: safeInt(fields[9]), latest_away_half_score: safeInt(fields[10]),
        latest_home_red: safeInt(fields[11]), latest_away_red: safeInt(fields[12]),
        latest_home_yellow: safeInt(fields[13]), latest_away_yellow: safeInt(fields[14]),
        latest_elapsed_min: elapsedMin, weather: '', round_info: '', is_neutrality: 0,
      });
    } catch (e) {}
  }
  return matches;
}

export async function fetchScheduleList() {
  // 使用本地时间计算北京日期，避免toISOString()的UTC转换问题
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;

  const [todayMatches, yesterdayMatches] = await Promise.all([
    fetchScheduleForDate(todayStr),
    fetchScheduleForDate(yesterdayStr),
  ]);

  const seenIds = new Set();
  const allMatches = [];
  for (const m of [...todayMatches, ...yesterdayMatches]) {
    if (!seenIds.has(m.id)) { seenIds.add(m.id); allMatches.push(m); }
  }
  return allMatches;
}

function nowBeijing() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

export async function fetchShijianPage(matchId) {
  const html = await fetchUrl(`${TITAN007_BASE}/Analy/ShiJian/${matchId}.htm`);
  let weather = '', roundInfo = '';
  const leagueMatch = html.match(/<div[^>]*class="league"[^>]*>(.*?)<\/div>/s);
  if (leagueMatch) {
    let leagueText = leagueMatch[1].replace(/<[^>]+>/g, '');
    leagueText = leagueText.replace(/&nbsp;?/g, ' ').replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
    const roundM = leagueText.match(/第(\d+)轮/);
    if (roundM) roundInfo = `第${roundM[1]}轮`;
    const timeM = leagueText.match(/\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.*)/);
    if (timeM) weather = timeM[1].trim();
  }
  const jsonData = extractJsonData(html);
  return { html, jsonData: jsonData ? filterOdds(jsonData) : null, weather, roundInfo };
}

export async function fetchAnalysisPage(matchId) {
  const html = await fetchUrl(`${TITAN007_BASE}/analy/Analysis/${matchId}.htm`);
  const jsonData = extractJsonData(html);
  return jsonData ? filterOdds(jsonData) : null;
}

export async function fetchMatchDetail(matchId) {
  const { html, jsonData: sjJson, weather, roundInfo } = await fetchShijianPage(matchId);
  const anJson = await fetchAnalysisPage(matchId);
  return { shijianHtml: html, shijianJson: sjJson, analysisJson: anJson, weather, roundInfo };
}

export async function fetchRecentMatchIds(matchId, count = 10) {
  const anJson = await fetchAnalysisPage(matchId);
  if (!anJson) return null;
  const nm = anJson.nearMatches || {};
  const homeData = nm.homeMatches || {};
  const awayData = nm.awayMatches || {};
  const homeMatches = homeData.matches || [];
  const awayMatches = awayData.matches || [];
  return {
    home_team: homeData.teamName || '',
    away_team: awayData.teamName || '',
    home_match_ids: homeMatches.map(m => m.id).filter(Boolean).slice(0, count),
    away_match_ids: awayMatches.map(m => m.id).filter(Boolean).slice(0, count),
  };
}

export function extractMatchInfoFromHtml(html) {
  const info = { home_score: 0, away_score: 0, home_half_score: 0, away_half_score: 0,
    sclass_name: '', round_info: '', weather: '', match_time: '', home_rank: 0, away_rank: 0 };
  if (!html) return info;

  let m = html.match(/id="homeScore"[^>]*>(\d+)</);
  if (m) info.home_score = parseInt(m[1]);
  m = html.match(/id="guestScore"[^>]*>(\d+)</);
  if (m) info.away_score = parseInt(m[1]);
  m = html.match(/halfScore[^>]*>\((\d+)-(\d+)\)/);
  if (m) { info.home_half_score = parseInt(m[1]); info.away_half_score = parseInt(m[2]); }

  const leagueM = html.match(/<div[^>]*class="league"[^>]*>(.*?)<\/div>/s);
  if (leagueM) {
    let leagueText = leagueM[1].replace(/<[^>]+>/g, '');
    leagueText = leagueText.replace(/&nbsp;?/g, ' ').replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = leagueText.split(' ', 1);
    if (parts.length) info.sclass_name = parts[0].trim();
    const roundM = leagueText.match(/第(\d+)轮/);
    if (roundM) info.round_info = `第${roundM[1]}轮`;
    const timeM = leagueText.match(/\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.*)/);
    if (timeM) info.weather = timeM[1].trim();
    const dateM = leagueText.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (dateM) {
      const year = nowBeijing().getFullYear();
      info.match_time = `${year}${dateM[1]}${dateM[2]}${dateM[3]}${dateM[4]}00`;
    }
  }

  const homeRankM = html.match(/id="homeName".*?document\.write\("\[(\d+)\]"\)/s);
  if (homeRankM) info.home_rank = parseInt(homeRankM[1]);
  const awayRankM = html.match(/id="guestName".*?document\.write\("\[(\d+)\]"\)/s);
  if (awayRankM) info.away_rank = parseInt(awayRankM[1]);

  return info;
}
