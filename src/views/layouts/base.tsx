import type { FC, PropsWithChildren } from 'hono/jsx';
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
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        .admin-root,
                        .admin-page {
                            min-height: 100%;
                            height: auto;
                            overflow: auto;
                        }

                        .admin-page {
                            --admin-bg: oklch(96.8% 0.012 228);
                            --admin-surface: oklch(99% 0.004 228);
                            --admin-surface-soft: oklch(94.8% 0.016 228);
                            --admin-surface-strong: oklch(22% 0.034 240);
                            --admin-text: oklch(23% 0.032 238);
                            --admin-text-soft: oklch(48% 0.028 238);
                            --admin-muted: oklch(63% 0.024 238);
                            --admin-border: oklch(88% 0.018 228);
                            --admin-primary: oklch(48% 0.145 242);
                            --admin-primary-hover: oklch(41% 0.14 242);
                            --admin-accent: oklch(65% 0.14 166);
                            --admin-warning: oklch(68% 0.16 67);
                            --admin-danger: oklch(55% 0.19 28);
                            --admin-radius: 8px;
                            --admin-shadow: 0 18px 48px rgba(25, 47, 72, 0.12);
                            --space-2xs: 4px;
                            --space-xs: 8px;
                            --space-sm: 12px;
                            --space-md: 16px;
                            --space-lg: 24px;
                            --space-xl: 32px;
                            --space-2xl: 48px;
                            color: var(--admin-text);
                            background:
                                radial-gradient(circle at 12% 8%, oklch(91% 0.052 194 / 0.72), transparent 28rem),
                                linear-gradient(135deg, var(--admin-bg), oklch(93% 0.012 252));
                            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
                            line-height: 1.5;
                        }

                        .admin-page a {
                            color: inherit;
                        }

                        .admin-container {
                            width: min(1220px, calc(100% - 40px));
                            margin: 0 auto;
                            padding: var(--space-xl) 0 var(--space-2xl);
                        }

                        .admin-header {
                            display: grid;
                            grid-template-columns: minmax(0, 1fr) auto;
                            align-items: center;
                            gap: var(--space-lg);
                            margin-bottom: var(--space-xl);
                        }

                        .admin-kicker {
                            margin-bottom: var(--space-xs);
                            color: var(--admin-primary);
                            font-size: 12px;
                            font-weight: 800;
                            letter-spacing: 0;
                        }

                        .admin-title-group h1 {
                            margin: 0;
                            color: var(--admin-text);
                            font-size: 30px;
                            line-height: 1.15;
                            letter-spacing: 0;
                        }

                        .admin-subtitle {
                            margin-top: var(--space-xs);
                            color: var(--admin-text-soft);
                            font-size: 14px;
                        }

                        .admin-nav {
                            display: flex;
                            align-items: center;
                            justify-content: flex-end;
                            flex-wrap: wrap;
                            gap: var(--space-xs);
                            padding: var(--space-xs);
                            border: 1px solid color-mix(in oklch, var(--admin-border), white 24%);
                            border-radius: 999px;
                            background: color-mix(in oklch, var(--admin-surface), transparent 8%);
                            box-shadow: 0 10px 30px rgba(25, 47, 72, 0.08);
                        }

                        .admin-nav a,
                        .admin-nav .btn {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            gap: var(--space-xs);
                            min-height: 38px;
                            padding: 8px 14px;
                            border: 1px solid transparent;
                            border-radius: 999px;
                            background: transparent;
                            box-shadow: none;
                            color: var(--admin-text-soft);
                            font-size: 13px;
                            font-weight: 700;
                            text-decoration: none;
                            transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
                        }

                        .admin-nav a:hover,
                        .admin-nav .btn:hover {
                            transform: translateY(-1px);
                            color: var(--admin-text);
                            background: var(--admin-surface-soft);
                            border-color: var(--admin-border);
                        }

                        .admin-nav a.active {
                            color: white;
                            border-color: color-mix(in oklch, var(--admin-primary), black 8%);
                            background: linear-gradient(135deg, var(--admin-primary), oklch(43% 0.12 226));
                        }

                        .admin-nav-form {
                            display: inline-flex;
                            margin: 0;
                        }

                        .stats-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
                            gap: var(--space-md);
                            margin-bottom: var(--space-xl);
                        }

                        .stat-card {
                            display: grid;
                            grid-template-columns: minmax(0, 1fr) auto;
                            gap: var(--space-md);
                            align-items: start;
                            min-height: 142px;
                            padding: var(--space-lg);
                            border: 1px solid color-mix(in oklch, var(--admin-border), white 10%);
                            border-radius: var(--admin-radius);
                            background: color-mix(in oklch, var(--admin-surface), transparent 2%);
                            box-shadow: 0 10px 26px rgba(25, 47, 72, 0.08);
                        }

                        .stat-card h3 {
                            margin: 0;
                            color: var(--admin-text-soft);
                            font-size: 13px;
                            font-weight: 800;
                            letter-spacing: 0;
                        }

                        .stat-card .value {
                            grid-column: 1 / -1;
                            color: var(--admin-text);
                            font-size: 38px;
                            font-weight: 850;
                            line-height: 1;
                        }

                        .stat-card .stat-hint {
                            grid-column: 1 / -1;
                            color: var(--admin-muted);
                            font-size: 13px;
                        }

                        .stat-detail {
                            grid-column: 1 / -1;
                            color: var(--admin-text);
                            font-size: 18px;
                            font-weight: 800;
                        }

                        .stat-icon {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 38px;
                            height: 38px;
                            border-radius: var(--admin-radius);
                            color: var(--admin-primary);
                            background: color-mix(in oklch, var(--admin-primary), white 88%);
                        }

                        .stat-card.empty-notes .value {
                            color: var(--admin-danger);
                        }

                        .delete-empty-btn {
                            grid-column: 1 / -1;
                            justify-self: start;
                            margin-top: var(--space-xs);
                        }

                        .admin-panel {
                            border: 1px solid color-mix(in oklch, var(--admin-border), white 8%);
                            border-radius: var(--admin-radius);
                            background: var(--admin-surface);
                            box-shadow: var(--admin-shadow);
                            overflow: hidden;
                        }

                        .panel-header {
                            display: flex;
                            align-items: flex-end;
                            justify-content: space-between;
                            gap: var(--space-md);
                            padding: var(--space-lg) var(--space-lg) var(--space-md);
                            border-bottom: 1px solid var(--admin-border);
                            background: linear-gradient(180deg, oklch(99% 0.004 228), oklch(97% 0.01 228));
                        }

                        .panel-header h2 {
                            margin: 0;
                            color: var(--admin-text);
                            font-size: 18px;
                            line-height: 1.2;
                        }

                        .panel-note {
                            margin: var(--space-xs) 0 0;
                            color: var(--admin-text-soft);
                            font-size: 13px;
                        }

                        .table-wrap {
                            overflow-x: auto;
                        }

                        .notes-table {
                            width: 100%;
                            min-width: 700px;
                            border-collapse: separate;
                            border-spacing: 0;
                            background: var(--admin-surface);
                        }

                        .notes-table th,
                        .notes-table td {
                            padding: 15px 18px;
                            text-align: left;
                            border-bottom: 1px solid var(--admin-border);
                            vertical-align: middle;
                        }

                        .notes-table th {
                            color: var(--admin-text-soft);
                            background: oklch(97% 0.01 228);
                            font-size: 12px;
                            font-weight: 800;
                            letter-spacing: 0;
                        }

                        .notes-table tbody tr {
                            transition: background 0.16s ease;
                        }

                        .notes-table tbody tr:hover {
                            background: oklch(96.5% 0.018 218);
                        }

                        .notes-table tbody tr:last-child td {
                            border-bottom: 0;
                        }

                        .note-key-link {
                            display: inline-flex;
                            align-items: center;
                            min-height: 30px;
                            padding: 5px 9px;
                            border: 1px solid var(--admin-border);
                            border-radius: 999px;
                            background: oklch(97.2% 0.012 228);
                            color: var(--admin-text);
                            font-size: 13px;
                            font-weight: 800;
                            text-decoration: none;
                        }

                        .note-key-link:hover {
                            color: var(--admin-primary);
                            border-color: color-mix(in oklch, var(--admin-primary), white 60%);
                        }

                        .note-preview-cell {
                            max-width: 340px;
                            overflow: hidden;
                            color: var(--admin-text-soft);
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }

                        .table-actions {
                            display: inline-flex;
                            align-items: center;
                            gap: var(--space-xs);
                        }

                        .search-bar {
                            display: grid;
                            grid-template-columns: minmax(220px, 1fr) 180px auto;
                            gap: var(--space-sm);
                            margin-bottom: var(--space-lg);
                            padding: var(--space-md);
                            border: 1px solid var(--admin-border);
                            border-radius: var(--admin-radius);
                            background: color-mix(in oklch, var(--admin-surface), transparent 6%);
                            box-shadow: 0 10px 26px rgba(25, 47, 72, 0.06);
                        }

                        .search-bar input,
                        .search-bar select,
                        .login-form input {
                            width: 100%;
                            min-height: 44px;
                            padding: 10px 13px;
                            border: 1px solid var(--admin-border);
                            border-radius: var(--admin-radius);
                            background: var(--admin-surface);
                            color: var(--admin-text);
                            font-size: 14px;
                            outline: none;
                            transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
                        }

                        .search-bar input:focus,
                        .search-bar select:focus,
                        .login-form input:focus {
                            border-color: color-mix(in oklch, var(--admin-primary), white 35%);
                            box-shadow: 0 0 0 4px color-mix(in oklch, var(--admin-primary), transparent 82%);
                        }

                        .pagination {
                            display: flex;
                            justify-content: center;
                            flex-wrap: wrap;
                            gap: var(--space-xs);
                            margin-top: var(--space-lg);
                        }

                        .pagination a {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            min-width: 38px;
                            min-height: 38px;
                            padding: 8px 12px;
                            border: 1px solid var(--admin-border);
                            border-radius: 999px;
                            background: var(--admin-surface);
                            color: var(--admin-text-soft);
                            font-size: 13px;
                            font-weight: 700;
                            text-decoration: none;
                        }

                        .pagination a:hover,
                        .pagination a.active {
                            color: white;
                            border-color: var(--admin-primary);
                            background: var(--admin-primary);
                        }

                        .list-summary {
                            margin-top: var(--space-md);
                            color: var(--admin-text-soft);
                            text-align: center;
                            font-size: 13px;
                        }

                        .admin-empty {
                            padding: var(--space-2xl) var(--space-lg);
                            color: var(--admin-text-soft);
                            text-align: center;
                        }

                        .admin-actions {
                            display: flex;
                            flex-wrap: wrap;
                            gap: var(--space-sm);
                            margin-top: var(--space-lg);
                        }

                        .note-preview-box {
                            max-height: 430px;
                            margin: var(--space-lg);
                            overflow: auto;
                            padding: var(--space-lg);
                            border: 1px solid var(--admin-border);
                            border-radius: var(--admin-radius);
                            background: oklch(97.5% 0.012 228);
                            color: var(--admin-text);
                            font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
                            font-size: 13px;
                            line-height: 1.65;
                            white-space: pre-wrap;
                        }

                        .admin-page .status-badge {
                            margin: 0;
                            padding: 5px 10px;
                            border-radius: 999px;
                            font-size: 12px;
                            font-weight: 800;
                            line-height: 1;
                        }

                        .admin-page .status-badge.private {
                            color: oklch(36% 0.12 28);
                            background: oklch(94% 0.035 28);
                        }

                        .admin-page .status-badge.protected {
                            color: oklch(38% 0.11 67);
                            background: oklch(94% 0.055 67);
                        }

                        .admin-page .status-badge.public {
                            color: oklch(34% 0.095 158);
                            background: oklch(93% 0.05 158);
                        }

                        .admin-page .btn {
                            border-radius: var(--admin-radius);
                        }

                        .admin-page .btn.primary {
                            border-color: color-mix(in oklch, var(--admin-primary), black 12%);
                            background: linear-gradient(135deg, var(--admin-primary), oklch(43% 0.12 226));
                        }

                        .admin-page .btn.danger {
                            border-color: color-mix(in oklch, var(--admin-danger), black 12%);
                            background: linear-gradient(135deg, var(--admin-danger), oklch(48% 0.18 28));
                        }

                        .admin-login-page {
                            display: grid;
                            min-height: 100vh;
                            place-items: center;
                            padding: var(--space-xl);
                        }

                        .login-form {
                            width: min(420px, 100%);
                            padding: var(--space-xl);
                            border: 1px solid color-mix(in oklch, var(--admin-border), white 8%);
                            border-radius: var(--admin-radius);
                            background: color-mix(in oklch, var(--admin-surface), transparent 2%);
                            box-shadow: var(--admin-shadow);
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
                            width: 46px;
                            height: 46px;
                            border-radius: var(--admin-radius);
                            color: white;
                            background: var(--admin-surface-strong);
                        }

                        .login-form h2 {
                            margin: 0;
                            color: var(--admin-text);
                            font-size: 24px;
                            line-height: 1.2;
                        }

                        .login-form .form-group {
                            margin-bottom: var(--space-md);
                        }

                        .login-form label {
                            margin-bottom: var(--space-xs);
                            color: var(--admin-text-soft);
                            font-size: 13px;
                        }

                        .login-form .btn {
                            width: 100%;
                            min-height: 46px;
                            font-size: 15px;
                        }

                        .error-message {
                            display: flex;
                            align-items: center;
                            gap: var(--space-xs);
                            margin-bottom: var(--space-md);
                            padding: var(--space-sm);
                            border: 1px solid oklch(86% 0.07 28);
                            border-radius: var(--admin-radius);
                            background: oklch(95% 0.035 28);
                            color: oklch(42% 0.16 28);
                            font-size: 13px;
                            font-weight: 700;
                            text-align: left;
                        }

                        @media (max-width: 820px) {
                            .admin-container {
                                width: min(100% - 24px, 1220px);
                                padding-top: var(--space-lg);
                            }

                            .admin-header {
                                grid-template-columns: 1fr;
                                align-items: start;
                            }

                            .admin-nav {
                                justify-content: flex-start;
                                width: 100%;
                                border-radius: var(--admin-radius);
                            }

                            .search-bar {
                                grid-template-columns: 1fr;
                            }

                            .panel-header {
                                align-items: flex-start;
                                flex-direction: column;
                            }
                        }

                        @media (max-width: 560px) {
                            .admin-title-group h1 {
                                font-size: 24px;
                            }

                            .stats-grid {
                                grid-template-columns: 1fr;
                            }

                            .notes-table {
                                min-width: 620px;
                            }

                            .admin-login-page {
                                padding: var(--space-md);
                            }

                            .login-form {
                                padding: var(--space-lg);
                            }
                        }
                    `
                }} />
                <script src="/static/admin.js" defer></script>
                </head>
                <body class="admin-page">
                    {children}
                </body>
            </html>
        </>
    );
};
