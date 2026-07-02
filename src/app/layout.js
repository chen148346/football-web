import './globals.css';

export const metadata = {
  title: '足球比赛数据文档分析系统',
  description: '实时足球比赛数据监控 · 手动快照 · 智能报告生成',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
