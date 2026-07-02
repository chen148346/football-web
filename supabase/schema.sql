-- ============================================================
-- 足球比赛数据文档分析系统 网络版 - Supabase 数据库 Schema
-- 在 Supabase Dashboard > SQL Editor 中执行此文件
-- ============================================================

-- 1. matches 表 - 比赛基本信息 + 最新状态
CREATE TABLE IF NOT EXISTS matches (
    id BIGINT PRIMARY KEY,
    sclass_id INTEGER,
    sclass_name TEXT,
    sclass_color TEXT,
    match_time TEXT,
    match_date TEXT,
    home_team TEXT,
    away_team TEXT,
    home_rank INTEGER DEFAULT 0,
    away_rank INTEGER DEFAULT 0,
    weather TEXT,
    round_info TEXT,
    is_neutrality INTEGER DEFAULT 0,
    latest_state_code INTEGER DEFAULT 0,
    latest_state_text TEXT DEFAULT '未开始',
    latest_state_display TEXT DEFAULT 'VS',
    latest_home_score INTEGER DEFAULT 0,
    latest_away_score INTEGER DEFAULT 0,
    latest_home_half_score INTEGER DEFAULT 0,
    latest_away_half_score INTEGER DEFAULT 0,
    latest_home_red INTEGER DEFAULT 0,
    latest_away_red INTEGER DEFAULT 0,
    latest_home_yellow INTEGER DEFAULT 0,
    latest_away_yellow INTEGER DEFAULT 0,
    latest_elapsed_min INTEGER DEFAULT 0,
    latest_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    first_seen_state INTEGER,
    halftime_snapshot_id BIGINT,
    min60_snapshot_id BIGINT,
    fulltime_snapshot_id BIGINT
);

-- 2. snapshots 表 - 数据快照
CREATE TABLE IF NOT EXISTS snapshots (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    snapshot_type TEXT DEFAULT 'manual',
    state_code INTEGER DEFAULT 0,
    state_text TEXT,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    home_half_score INTEGER DEFAULT 0,
    away_half_score INTEGER DEFAULT 0,
    elapsed_min INTEGER DEFAULT 0,
    shijian_json TEXT,
    analysis_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. reports 表 - 报告记录
CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    snapshot_id BIGINT REFERENCES snapshots(id) ON DELETE SET NULL,
    report_type TEXT,
    file_path TEXT,
    file_name TEXT,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_snapshots_match ON snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON snapshots(match_id, snapshot_type);
CREATE INDEX IF NOT EXISTS idx_reports_match ON reports(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(latest_state_code);
CREATE INDEX IF NOT EXISTS idx_matches_time ON matches(match_time);

-- RLS 策略（允许匿名读取，service_role 完全访问）
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read on matches" ON matches FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read on snapshots" ON snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read on reports" ON reports FOR SELECT TO anon USING (true);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.latest_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER matches_updated_at
    BEFORE UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Storage Bucket: 在 Supabase Dashboard > Storage 中创建
-- Bucket 名称: reports
-- 设置为 Public（公开读取）
-- ============================================================
