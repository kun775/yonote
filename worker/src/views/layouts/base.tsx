import type { FC, PropsWithChildren } from 'hono/jsx';

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
        <html lang="zh">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <title>{title}</title>
                <link rel="stylesheet" href="/static/style.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
                <script src="https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css" />
                <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
                <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
                {noteKey && (
                    <script dangerouslySetInnerHTML={{
                        __html: `
                            window.authenticated = ${authenticated ? 'true' : 'false'};
                            window.noteUpdatedAt = ${updatedAt || 0};
                            window.noteKey = "${noteKey}";
                            window.viewOnly = ${viewOnly ? 'true' : 'false'};
                            window.password = ${hasPassword ? 'true' : 'false'};
                            window.public = ${isPublic ? 'true' : 'false'};
                        `
                    }} />
                )}
                <script src="/static/function.js"></script>
                <script src="/static/app.js"></script>
            </head>
            <body>
                {children}
            </body>
        </html>
    );
};

export const AdminLayout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => {
    return (
        <html lang="zh">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{title} - YoNote 管理</title>
                <link rel="stylesheet" href="/static/style.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
                <style dangerouslySetInnerHTML={{
                    __html: `
                        .admin-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                        .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
                        .admin-nav { display: flex; gap: 15px; }
                        .admin-nav a { color: #666; text-decoration: none; padding: 8px 16px; border-radius: 4px; }
                        .admin-nav a:hover, .admin-nav a.active { background: #f0f0f0; color: #333; }
                        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                        .stat-card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .stat-card h3 { margin: 0 0 10px; color: #666; font-size: 14px; }
                        .stat-card .value { font-size: 32px; font-weight: bold; color: #333; }
                        .notes-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .notes-table th, .notes-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
                        .notes-table th { background: #f8f9fa; font-weight: 600; color: #666; }
                        .notes-table tr:hover { background: #f8f9fa; }
                        .search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
                        .search-bar input { flex: 1; padding: 10px 15px; border: 1px solid #ddd; border-radius: 4px; }
                        .search-bar select { padding: 10px 15px; border: 1px solid #ddd; border-radius: 4px; }
                        .pagination { display: flex; justify-content: center; gap: 5px; margin-top: 20px; }
                        .pagination a { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; text-decoration: none; color: #666; }
                        .pagination a:hover, .pagination a.active { background: #007bff; color: white; border-color: #007bff; }
                        .login-form { max-width: 400px; margin: 100px auto; padding: 40px; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .login-form h2 { text-align: center; margin-bottom: 30px; }
                        .login-form input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                        .login-form button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
                        .login-form button:hover { background: #0056b3; }
                        .error-message { color: #dc3545; margin-bottom: 15px; text-align: center; }
                        .stat-card.empty-notes { position: relative; }
                        .stat-card.empty-notes .value { color: #dc3545; }
                        .delete-empty-btn { margin-top: 10px; }
                        .btn.danger { background: #dc3545; color: white; border: none; cursor: pointer; }
                        .btn.danger:hover { background: #c82333; }
                        .btn.small { padding: 6px 12px; font-size: 12px; border-radius: 4px; }
                    `
                }} />
                <script dangerouslySetInnerHTML={{
                    __html: `
                        async function deleteEmptyNotes() {
                            if (!confirm('确定要删除所有空笔记吗？此操作不可恢复！')) {
                                return;
                            }
                            try {
                                const response = await fetch('/admin/notes-empty', {
                                    method: 'DELETE',
                                    credentials: 'same-origin'
                                });
                                const data = await response.json();
                                if (data.success) {
                                    alert('成功删除 ' + data.deleted + ' 条空笔记');
                                    location.reload();
                                } else {
                                    alert('删除失败');
                                }
                            } catch (error) {
                                alert('删除失败: ' + error.message);
                            }
                        }
                    `
                }} />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
};
