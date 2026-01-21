import type { FC } from 'hono/jsx';

interface PasswordPageProps {
    noteKey: string;
    isPublic: boolean;
    error?: string;
}

export const PasswordPage: FC<PasswordPageProps> = ({ noteKey, isPublic, error }) => {
    return (
        <html lang="zh">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>密码验证 - {noteKey}</title>
                <link rel="stylesheet" href="/static/style.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
            </head>
            <body>
                <div class="password-container">
                    <div class="password-box">
                        <div class="password-header">
                            <i class="fas fa-lock"></i>
                            <h2>笔记已加密</h2>
                        </div>
                        <p class="password-description">
                            此笔记受密码保护，请输入密码以继续。
                        </p>

                        {error && (
                            <div class="flash-message error">{error}</div>
                        )}

                        <form action={`/${noteKey}/verify`} method="post" class="password-form">
                            <input type="hidden" name="next_url" value={`/${noteKey}`} />
                            <div class="form-group">
                                <label for="password">密码</label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    placeholder="请输入密码"
                                    required
                                    autofocus
                                />
                            </div>
                            <button type="submit" class="btn primary full-width">
                                <i class="fas fa-unlock"></i> 验证密码
                            </button>
                        </form>

                        {isPublic && (
                            <div class="password-footer">
                                <p>此笔记已公开，您也可以</p>
                                <a href={`/${noteKey}?view=1`} class="btn secondary">
                                    <i class="fas fa-eye"></i> 只读查看
                                </a>
                            </div>
                        )}

                        <div class="back-link">
                            <a href="/">
                                <i class="fas fa-arrow-left"></i> 返回首页
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
};
