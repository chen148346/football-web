/**
 * 配置模块 - 对应本地版 config.py
 */

export const TITAN007_BASE = 'https://m.titan007.com';

export const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; Redmi Note 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
];

export function getRandomHeaders() {
  return {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Referer': 'https://m.titan007.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
}

export const REQUEST_TIMEOUT = 20000;
export const REQUEST_RETRIES = 3;
export const REQUEST_DELAY_MIN = 500;
export const REQUEST_DELAY_MAX = 2000;

export const MIN60_SNAPSHOT_LOWER = 58;
export const MIN60_SNAPSHOT_UPPER = 65;

export const STATE_CODES = {
  '-1': '完场', '0': '未开始', '1': '上半场', '2': '中场',
  '3': '下半场', '4': '加时', '-10': '取消', '-11': '待定',
  '-12': '腰斩', '-13': '中断', '-14': '推迟',
};

export const STATE_SORT_PRIORITY = {
  1: 0, 3: 0, 4: 0, 2: 1, 0: 2, '-1': 3,
  '-13': 4, '-14': 4, '-11': 4, '-12': 4, '-10': 4,
};

export const ODDS_JSON_KEYS = new Set([
  'oddsRecords', 'cornerOdds', 'leaguePanlu', 'theSamePanKou',
  'multiLeaguePanLu', 'multiSamePanKou', 'xinShuiRecommend',
]);

export const BEIJING_TZ_OFFSET = 8 * 60 * 60 * 1000;
export const TEAM_RECENT_MATCH_COUNT = 10;
