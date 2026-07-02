# 足球比赛数据文档分析系统 - 网络版 V2.1

## 快速开始

### 1. 环境要求
- Node.js 18+
- Supabase 账号（免费版即可）
- Vercel 账号

### 2. 本地开发
```bash
npm install
cp .env.example .env.local
# 编辑 .env.local 填入 Supabase 配置
npm run dev
```
访问 http://localhost:3000

### 3. 部署到 Vercel
详见 `docs/部署文档.md`

## 项目结构
```
football_web_v2/
├── src/
│   ├── app/
│   │   ├── api/              # API路由（9个）
│   │   ├── match-detail/     # 比赛详情页
│   │   ├── page.js           # 首页
│   │   ├── layout.js         # 全局布局
│   │   └── globals.css       # 全局样式
│   └── lib/                  # 核心库（6个模块）
│       ├── config.js         # 配置
│       ├── match_time_calc.js # 实时状态计算
│       ├── scraper.js        # 数据抓取
│       ├── supabase_db.js    # 数据库访问层
│       ├── scheduler.js      # 调度逻辑
│       ├── report_generator.js # 报告生成
│       └── team_report_generator.js # 近期赛况报告
├── supabase/
│   └── schema.sql            # 数据库建表脚本
├── docs/
│   ├── 项目文档.md            # 网络版项目文档
│   └── 部署文档.md            # 部署维护文档
├── package.json
├── next.config.js
├── tsconfig.json
├── vercel.json
└── .env.example
```

## 技术栈
- Next.js 14 + React 18
- Supabase (PostgreSQL + Storage)
- Vercel (部署 + Cron)
- docx (报告生成)
