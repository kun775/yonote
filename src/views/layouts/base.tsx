import type { FC, PropsWithChildren, Child } from 'hono/jsx';
import { raw } from 'hono/html';

interface BaseLayoutProps {
    title: string;
    noteKey?: string;
    authenticated?: boolean;
    viewOnly?: boolean;
    hasPassword?: boolean;
    isPublic?: boolean;
    updatedAt?: number;
}

export const BaseLayout: FC<PropsWithChildren<BaseLayoutProps>> = (props) => {
    const { title, children, noteKey, authenticated, viewOnly, hasPassword, isPublic, updatedAt } = props;

    return (
        <>
            {raw('<!DOCTYPE html>')}
            <html lang="zh">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                    <title>{title}</title>
                    <link rel="stylesheet" href="/static/style.css" />
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css" />
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css" />
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css" />
                    <script src="https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js" defer></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js" defer></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js" defer></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js" defer></script>
                    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" defer></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js" defer></script>
                    <script src="/static/function.js" defer></script>
                    <script src="/static/app.js" defer></script>
                </head>
                <body
                    data-authenticated={authenticated ? 'true' : 'false'}
                    data-note-updated-at={updatedAt || 0}
                    data-note-key={noteKey || ''}
                    data-view-only={viewOnly ? 'true' : 'false'}
                    data-password={hasPassword ? 'true' : 'false'}
                    data-public={isPublic ? 'true' : 'false'}
                >
                    {children}
                </body>
            </html>
        </>
    );
};

// ---------------------------------------------------------------------------
// 后台管理页面的设计系统：Notion（规格见仓库根目录 DESIGN.md）
//
// 与 DESIGN.md 的对应关系：
//   - 色板：暖中性灰 + 唯一饱和色 Notion Blue(#0075de) —— DESIGN.md §2 / §9
//   - 字体：NotionInter → Inter → 系统栈。**不引入外部字体文件**：页面 CSP 的 font-src 只放行
//     self/data/cdnjs，引 Google Fonts 会被拦截；本机缺 Inter 时回退系统 UI 字体，观感一致
//   - 四档字重 400/500/600/700，标题负字距随字号收敛（§3）
//   - whisper 边框 `1px rgba(0,0,0,0.1)` + 4~5 层低透明度阴影，不用重投影（§6）
//   - 圆角：按钮/输入 4px，卡片/面板 12px，徽章 9999px（§5）
//
// 有意为之的两处偏离（可用性优先，非遗漏）：
//   1. §8 规定按钮 hover `scale(1.05)`、active `scale(0.9)`；表格行内的小按钮这样会跳动，
//      故小按钮改为背景色变化 + active `scale(0.97)`，仅主要按钮保留缩放反馈。
//   2. 输入框内边距由示例的 `6px` 提到 `8px 12px`，以满足后台表单的点击区域。
//
// 重构约束：类名与 DESIGN.md 无关，全部沿用重构前的命名（.admin-panel / .stat-card /
// .notes-table / .status-badge / ...），public/static/admin.js 依赖的 data-* 钩子、
// 表单 action 与所有路由链接均未改动，因此不涉及任何行为变更。
// ---------------------------------------------------------------------------

const ADMIN_PAGE_STYLES = `
/* 覆盖 style.css 的 html/body { overflow: hidden }，后台需要整页滚动 */
.admin-root,
.admin-page {
    min-height: 100%;
    height: auto;
    overflow: auto;
}

.admin-page {
    /* ---- Notion 设计令牌（DESIGN.md §2 / §9） ---- */
    --nt-canvas: #ffffff;
    --nt-bg: #f6f5f4;
    --nt-text: rgba(0, 0, 0, 0.95);
    --nt-text-2: #615d59;
    --nt-text-3: #a39e98;
    --nt-border: rgba(0, 0, 0, 0.1);
    --nt-border-input: #dddddd;
    --nt-blue: #0075de;
    --nt-blue-active: #005bab;
    --nt-blue-focus: #097fe8;
    --nt-badge-bg: #f2f9ff;
    --nt-badge-text: #097fe8;
    --nt-teal: #2a9d99;
    --nt-orange: #dd5b00;
    --nt-purple: #391c57;
    --nt-radius-xs: 4px;
    --nt-radius-sm: 8px;
    --nt-radius: 12px;
    --nt-shadow-card: 0 4px 18px rgba(0, 0, 0, 0.04), 0 2.025px 7.847px rgba(0, 0, 0, 0.027),
        0 0.8px 2.925px rgba(0, 0, 0, 0.02), 0 0.175px 1.041px rgba(0, 0, 0, 0.01);
    --nt-shadow-deep: 0 1px 3px rgba(0, 0, 0, 0.01), 0 3px 7px rgba(0, 0, 0, 0.02),
        0 7px 15px rgba(0, 0, 0, 0.02), 0 14px 28px rgba(0, 0, 0, 0.04),
        0 23px 52px rgba(0, 0, 0, 0.05);
    --space-2xs: 4px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;

    color: var(--nt-text);
    background-color: var(--nt-bg);
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
        'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif;
    font-feature-settings: 'lnum', 'locl';
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
}

.admin-page a {
    color: inherit;
}

/* 清除 style.css 的全局泄漏：其第 697 行的选择器是 ".markdown-body h1, h2, h3, h4, h5, h6"，
   只有 h1 被限定在 .markdown-body 内，于是 h2~h6 被全站加上了 !important 的深色下边框。
   笔记页的弹窗标题依赖这个观感，故不改 style.css，只在后台作用域内清掉。 */
.admin-page h2,
.admin-page h3,
.admin-page h4,
.admin-page h5,
.admin-page h6 {
    border-bottom: 0 !important;
}

/* ---- 顶栏：白底 + whisper 下边框（§4 Navigation） ---- */
.admin-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--nt-canvas);
    border-bottom: 1px solid var(--nt-border);
}

.admin-topbar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    width: min(1200px, calc(100% - 48px));
    min-height: 60px;
    margin: 0 auto;
}

.admin-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--nt-text);
    text-decoration: none;
}

.admin-brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: var(--nt-blue);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
}

.admin-brand-name {
    font-size: 15px;
    font-weight: 600;
}

.admin-brand-sub {
    color: var(--nt-text-3);
    font-size: 15px;
    font-weight: 500;
}

.admin-nav {
    display: flex;
    align-items: center;
    gap: 2px;
}

.admin-nav a,
.admin-nav .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--nt-radius-xs);
    background: transparent;
    box-shadow: none;
    color: var(--nt-text-2);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s ease, color 0.15s ease;
}

.admin-nav a:hover,
.admin-nav .btn:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--nt-text);
}

.admin-nav a.active {
    background: rgba(0, 0, 0, 0.06);
    color: var(--nt-text);
    font-weight: 600;
}

.admin-nav-form {
    display: inline-flex;
    margin: 0 0 0 8px;
    padding-left: 8px;
    border-left: 1px solid var(--nt-border);
}

/* ---- 页面骨架 ---- */
.admin-container {
    width: min(1200px, calc(100% - 48px));
    margin: 0 auto;
    padding: var(--space-xl) 0 72px;
}

.admin-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
}

.admin-kicker {
    display: inline-block;
    margin-bottom: 10px;
    padding: 4px 8px;
    border-radius: 9999px;
    background: var(--nt-badge-bg);
    color: var(--nt-badge-text);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.125px;
    line-height: 1.33;
}

.admin-title-group h1 {
    margin: 0;
    color: var(--nt-text);
    font-size: 32px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.704px;
}

.admin-subtitle {
    margin: 8px 0 0;
    color: var(--nt-text-2);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.5;
}

.admin-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
}

/* ---- 指标卡（§4 Metric Cards） ---- */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
}

.stat-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-sm);
    align-items: start;
    padding: 20px;
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius);
    background: var(--nt-canvas);
    box-shadow: var(--nt-shadow-card);
    transition: box-shadow 0.18s ease;
}

.stat-card:hover {
    box-shadow: var(--nt-shadow-deep);
}

.stat-card h3 {
    margin: 0;
    color: var(--nt-text-2);
    font-size: 14px;
    font-weight: 500;
}

.stat-card .value {
    grid-column: 1 / -1;
    color: var(--nt-text);
    font-size: 40px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.9px;
}

.stat-card .stat-hint {
    grid-column: 1 / -1;
    color: var(--nt-text-3);
    font-size: 13px;
}

.stat-detail {
    grid-column: 1 / -1;
    color: var(--nt-text);
    font-size: 18px;
    font-weight: 600;
}

.stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--nt-radius-sm);
    background: var(--nt-bg);
    color: var(--nt-text-2);
    font-size: 14px;
}

.stat-card.empty-notes .value {
    color: var(--nt-orange);
}

.delete-empty-btn {
    grid-column: 1 / -1;
    justify-self: start;
    margin-top: var(--space-2xs);
}

/* ---- 面板与表格 ---- */
.admin-panel {
    margin-bottom: var(--space-lg);
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius);
    background: var(--nt-canvas);
    box-shadow: var(--nt-shadow-card);
    overflow: hidden;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: 18px var(--space-lg);
    border-bottom: 1px solid var(--nt-border);
}

.panel-header h2 {
    margin: 0;
    color: var(--nt-text);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.27;
    letter-spacing: -0.25px;
}

.panel-note {
    margin: var(--space-2xs) 0 0;
    color: var(--nt-text-2);
    font-size: 14px;
    font-weight: 400;
}

.table-wrap {
    overflow-x: auto;
}

.notes-table {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    background: var(--nt-canvas);
}

.notes-table th,
.notes-table td {
    padding: 12px var(--space-lg);
    text-align: left;
    vertical-align: middle;
    border-bottom: 1px solid var(--nt-border);
}

.notes-table th {
    color: var(--nt-text-2);
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.125px;
}

.notes-table td {
    color: var(--nt-text-2);
    font-size: 14px;
}

.notes-table tbody tr {
    transition: background 0.12s ease;
}

.notes-table tbody tr:hover {
    background: var(--nt-bg);
}

.notes-table tbody tr:last-child td {
    border-bottom: 0;
}

.note-key-link {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 2px 9px;
    border: 1px solid var(--nt-border);
    border-radius: 9999px;
    background: var(--nt-bg);
    color: var(--nt-text);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.note-key-link:hover {
    border-color: rgba(9, 127, 232, 0.35);
    background: var(--nt-badge-bg);
    color: var(--nt-badge-text);
}

.note-preview-cell {
    max-width: 340px;
    overflow: hidden;
    color: var(--nt-text-2);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.table-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.admin-empty {
    padding: 56px var(--space-lg);
    color: var(--nt-text-3);
    text-align: center;
    font-size: 14px;
}

/* ---- 状态徽章（§4 Pill Badge；文字色在各自色相上压深，以满足 AA 对比度） ---- */
.admin-page .status-badge {
    display: inline-flex;
    align-items: center;
    margin: 0;
    padding: 3px 9px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.33;
    letter-spacing: 0.125px;
}

.admin-page .status-badge.public {
    color: #1f7a76;
    background: rgba(42, 157, 153, 0.12);
}

.admin-page .status-badge.protected {
    color: #b34700;
    background: rgba(221, 91, 0, 0.12);
}

.admin-page .status-badge.private {
    color: var(--nt-purple);
    background: rgba(57, 28, 87, 0.1);
}

/* ---- 按钮（§4 Buttons） ---- */
.admin-page .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid transparent;
    border-radius: var(--nt-radius-xs);
    background: rgba(0, 0, 0, 0.05);
    color: var(--nt-text);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.33;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
}

.admin-page .btn:hover {
    background: rgba(0, 0, 0, 0.08);
}

.admin-page .btn:active {
    transform: scale(0.97);
}

.admin-page .btn:focus-visible {
    outline: 2px solid var(--nt-blue-focus);
    outline-offset: 2px;
}

.admin-page .btn.primary {
    background: var(--nt-blue);
    color: #ffffff;
}

.admin-page .btn.primary:hover {
    background: var(--nt-blue-active);
}

.admin-page .btn.primary:not(.small):hover {
    transform: scale(1.02);
}

.admin-page .btn.secondary {
    background: rgba(0, 0, 0, 0.05);
    color: var(--nt-text);
}

.admin-page .btn.danger {
    background: rgba(221, 91, 0, 0.12);
    color: #b34700;
}

.admin-page .btn.danger:hover {
    background: rgba(221, 91, 0, 0.18);
}

.admin-page .btn.small {
    padding: 5px 10px;
    border-radius: var(--nt-radius-xs);
    font-size: 13px;
}

.admin-page .btn.small i {
    font-size: 12px;
}

.admin-page .btn.full-width {
    width: 100%;
}

/* ---- 表单控件 ---- */
.search-bar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 180px auto;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius);
    background: var(--nt-canvas);
    box-shadow: var(--nt-shadow-card);
}

.admin-page input[type='text'],
.admin-page input[type='password'],
.admin-page select {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--nt-border-input);
    border-radius: var(--nt-radius-xs);
    background: var(--nt-canvas);
    color: var(--nt-text);
    font-family: inherit;
    font-size: 15px;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.admin-page input[type='text']:focus,
.admin-page input[type='password']:focus,
.admin-page select:focus {
    border-color: var(--nt-blue-focus);
    box-shadow: 0 0 0 3px rgba(9, 127, 232, 0.18);
}

.admin-page input::placeholder {
    color: var(--nt-text-3);
}

/* ---- 分页与页脚说明 ---- */
.pagination {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    margin-top: var(--space-lg);
}

.pagination a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius-xs);
    background: var(--nt-canvas);
    color: var(--nt-text-2);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s ease, color 0.15s ease;
}

.pagination a:hover {
    background: var(--nt-bg);
    color: var(--nt-text);
}

.pagination a.active {
    border-color: var(--nt-blue);
    background: var(--nt-blue);
    color: #ffffff;
    font-weight: 600;
}

.list-summary {
    margin-top: var(--space-md);
    color: var(--nt-text-3);
    text-align: center;
    font-size: 13px;
}

.admin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-lg);
}

/* ---- 内容预览（代码类内容，保留等宽字体） ---- */
.note-preview-box {
    max-height: 460px;
    margin: var(--space-lg);
    overflow: auto;
    padding: var(--space-md) var(--space-lg);
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius-sm);
    background: var(--nt-bg);
    color: var(--nt-text);
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
}

/* ---- 登录页 ---- */
.admin-login-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: var(--space-lg);
}

.login-form {
    width: min(420px, 100%);
    padding: var(--space-xl);
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius);
    background: var(--nt-canvas);
    box-shadow: var(--nt-shadow-deep);
}

.login-brand {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
}

.login-brand-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--nt-radius-sm);
    background: var(--nt-blue);
    color: #ffffff;
    font-size: 16px;
}

.login-form h2 {
    margin: 0;
    color: var(--nt-text);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.27;
    letter-spacing: -0.25px;
}

.login-form .form-group {
    margin-bottom: var(--space-md);
}

.login-form label {
    display: block;
    margin-bottom: 6px;
    color: var(--nt-text-2);
    font-size: 14px;
    font-weight: 500;
}

.login-form .btn {
    width: 100%;
    min-height: 42px;
    font-size: 15px;
}

.login-divider {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: var(--space-md) 0;
    color: var(--nt-text-3);
    font-size: 12px;
    font-weight: 500;
}

.login-divider::before,
.login-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--nt-border);
}

.login-notice {
    padding: var(--space-md);
    border: 1px solid var(--nt-border);
    border-radius: var(--nt-radius-sm);
    background: var(--nt-bg);
    color: var(--nt-text-2);
    font-size: 14px;
    line-height: 1.6;
}

.login-notice p {
    margin: 0 0 var(--space-xs);
}

.login-notice p:last-child {
    margin-bottom: 0;
}

.login-notice-title {
    color: var(--nt-text);
    font-weight: 600;
}

.error-message {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
    padding: 10px 12px;
    border: 1px solid rgba(221, 91, 0, 0.28);
    border-radius: var(--nt-radius-sm);
    background: rgba(221, 91, 0, 0.08);
    color: #b34700;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
}

/* ---- 响应式（§7 Breakpoints） ---- */
@media (max-width: 1080px) {
    .stats-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
}

@media (max-width: 820px) {
    .admin-topbar-inner {
        width: calc(100% - 32px);
        flex-wrap: wrap;
        justify-content: flex-start;
        padding: 8px 0;
    }

    .admin-container {
        width: calc(100% - 32px);
        padding-top: var(--space-lg);
    }

    .admin-hero {
        align-items: flex-start;
    }

    .search-bar {
        grid-template-columns: 1fr;
    }

    .panel-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .notes-table th,
    .notes-table td {
        padding: 10px 14px;
    }

    .note-preview-box {
        margin: var(--space-md);
        padding: var(--space-md);
    }
}

@media (max-width: 560px) {
    .admin-title-group h1 {
        font-size: 26px;
        letter-spacing: -0.5px;
    }

    .stats-grid {
        grid-template-columns: 1fr;
    }

    .admin-nav {
        width: 100%;
        overflow-x: auto;
    }

    .admin-nav-form {
        margin-left: auto;
    }

    .login-form {
        padding: var(--space-lg);
    }
}
`;

export const AdminLayout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => {
    return (
        <>
            {raw('<!DOCTYPE html>')}
            <html lang="zh" class="admin-root">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>{title} - YoNote 管理</title>
                    <link rel="stylesheet" href="/static/style.css" />
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
                    <style dangerouslySetInnerHTML={{ __html: ADMIN_PAGE_STYLES }} />
                    <script src="/static/admin.js" defer></script>
                </head>
                <body class="admin-page">
                    {children}
                </body>
            </html>
        </>
    );
};

interface AdminShellProps {
    /** 标题上方的分类徽章（YONOTE ADMIN / NOTES / NOTE DETAIL） */
    kicker: string;
    title: string;
    subtitle: string;
    /** 当前高亮的一级导航项 */
    active: 'dashboard' | 'notes';
    /** 页面级主操作，渲染在标题区右侧 */
    actions?: Child;
}

// AdminShell 后台内页的统一骨架：顶栏（品牌 + 一级导航 + 退出）+ 标题区 + 内容容器
//
// 参数:
//   - kicker string: 标题上方的分类徽章文案
//   - title string: 页面主标题
//   - subtitle string: 主标题下的一句说明
//   - active 'dashboard' | 'notes': 当前高亮的一级导航项
//   - actions Child: 可选，页面级主操作
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化；把原先散落在三个页面里的头部结构与导航抽取为单一组件。
export const AdminShell: FC<PropsWithChildren<AdminShellProps>> = ({ kicker, title, subtitle, active, actions, children }) => {
    return (
        <>
            <header class="admin-topbar">
                <div class="admin-topbar-inner">
                    <a class="admin-brand" href="/admin/dashboard">
                        <span class="admin-brand-mark">Y</span>
                        <span class="admin-brand-name">YoNote</span>
                        <span class="admin-brand-sub">Admin</span>
                    </a>
                    <nav class="admin-nav">
                        <a href="/admin/dashboard" class={active === 'dashboard' ? 'active' : ''}>
                            <i class="fas fa-tachometer-alt"></i> 仪表盘
                        </a>
                        <a href="/admin/notes" class={active === 'notes' ? 'active' : ''}>
                            <i class="fas fa-sticky-note"></i> 笔记管理
                        </a>
                        <form action="/admin/logout" method="post" class="admin-nav-form">
                            <button type="submit" class="btn small">
                                <i class="fas fa-sign-out-alt"></i> 退出
                            </button>
                        </form>
                    </nav>
                </div>
            </header>

            <div class="admin-container">
                <div class="admin-hero">
                    <div class="admin-title-group">
                        <span class="admin-kicker">{kicker}</span>
                        <h1>{title}</h1>
                        <p class="admin-subtitle">{subtitle}</p>
                    </div>
                    {actions ? <div class="admin-hero-actions">{actions}</div> : null}
                </div>
                {children}
            </div>
        </>
    );
};
