/**
 * 实时状态计算模块 - 对应本地版 match_time_calc.py
 * 逆向工程 titan007 的 showMatchState JavaScript 函数
 */
import { TITAN007_BASE, getRandomHeaders, REQUEST_TIMEOUT, BEIJING_TZ_OFFSET } from './config.js';

export function nowBeijing() {
  return new Date(Date.now() + BEIJING_TZ_OFFSET);
}

export function beijingDateStr() {
  return nowBeijing().toISOString().slice(0, 10);
}

let serverTimeCache = { value: null, timestamp: 0 };
const SERVER_TIME_CACHE_TTL = 300000;

export async function getServerTime() {
  const now = Date.now();
  if (serverTimeCache.value && now - serverTimeCache.timestamp < SERVER_TIME_CACHE_TTL) {
    return serverTimeCache.value;
  }
  try {
    const resp = await fetch(`${TITAN007_BASE}/txt/time.shtml`, {
      headers: getRandomHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    const text = await resp.text();
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (clean.length >= 14 && /^\d+$/.test(clean.slice(0, 14))) {
      const y = parseInt(clean.slice(0, 4));
      const mo = parseInt(clean.slice(4, 6)) - 1;
      const d = parseInt(clean.slice(6, 8));
      const h = parseInt(clean.slice(8, 10));
      const mi = parseInt(clean.slice(10, 12));
      const s = parseInt(clean.slice(12, 14));
      const dt = new Date(y, mo, d, h, mi, s);
      serverTimeCache = { value: dt, timestamp: now };
      return dt;
    }
  } catch (e) {
    console.error('获取服务器时间失败:', e);
  }
  return nowBeijing();
}

export function extractHeadStartTime(html) {
  if (!html) return null;
  const m = html.match(/headStartTime\s*=\s*new Date\("([^"]+)"\)/);
  if (!m) return null;
  const parts = m[1].match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/);
  if (parts) {
    const [_, y, mo, d, h, mi, s] = parts.map(Number);
    return new Date(y, mo - 1, d, h, mi, s);
  }
  return null;
}

export function showMatchState(stateCode, headStartTime = null, serverTime = null) {
  const stateTextMap = {
    4: '加时', 3: '下半场', 2: '中场', 1: '上半场', 0: 'VS',
    '-1': '完场', '-10': '取消', '-11': '待定', '-12': '腰斩',
    '-13': '中断', '-14': '推迟', 5: '点球',
  };
  let ms = stateTextMap[stateCode] || '';

  if (stateCode === 1) {
    if (!headStartTime) return ms;
    const st = serverTime || nowBeijing();
    const df = Math.floor((st - headStartTime) / 60000);
    if (df <= 0) ms = "1'";
    else if (df <= 45) ms = `${df}'`;
    else ms = `45+${df - 45}'`;
  } else if (stateCode === 3) {
    if (!headStartTime) return ms;
    const st = serverTime || nowBeijing();
    const df = Math.floor((st - headStartTime) / 60000) + 46;
    if (df <= 46) ms = "46'";
    else if (df < 90) ms = `${df}'`;
    else ms = `90+${df - 90}'`;
  }
  return ms;
}

export function estimateElapsedMin(stateCode, matchTimeStr, serverTime = null) {
  if (![1, 3, 4].includes(stateCode)) return 0;
  if (!matchTimeStr || matchTimeStr.length < 14) return 0;
  const y = parseInt(matchTimeStr.slice(0, 4));
  const mo = parseInt(matchTimeStr.slice(4, 6)) - 1;
  const d = parseInt(matchTimeStr.slice(6, 8));
  const h = parseInt(matchTimeStr.slice(8, 10));
  const mi = parseInt(matchTimeStr.slice(10, 12));
  const s = parseInt(matchTimeStr.slice(12, 14));
  const kickoff = new Date(y, mo, d, h, mi, s);
  const st = serverTime || nowBeijing();
  const elapsedMin = Math.floor((st - kickoff) / 60000);
  if (stateCode === 1) return Math.max(1, Math.min(elapsedMin, 45));
  if (stateCode === 3) return Math.max(46, Math.min(elapsedMin - 15, 120));
  if (stateCode === 4) return 91;
  return 0;
}
