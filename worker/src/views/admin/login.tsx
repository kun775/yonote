import type { FC } from 'hono/jsx';
import { AdminLayout } from '../layouts/base';

interface LoginPageProps {
    error?: string;
}

export const AdminLoginPage: FC<LoginPageProps> = ({ error }) => {
    return (
        <AdminLayout title="登录">
            <div class="admin-login-page">
                <div class="login-form">
                    <div class="login-brand">
                        <span class="login-brand-icon">
                            <i class="fas fa-lock"></i>
                        </span>
                        <div>
                            <h2>管理后台</h2>
                            <p class="admin-subtitle">YoNote 站点管理入口</p>
                        </div>
                    </div>
                    {error && (
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>{error}</span>
                        </div>
                    )}
                    <form method="post" action="/admin/login">
                        <div class="form-group">
                            <label for="admin-password">管理密码</label>
                            <input
                                id="admin-password"
                                type="password"
                                name="password"
                                placeholder="请输入管理密码"
                                required
                                autofocus
                            />
                        </div>
                        <button type="submit" class="btn primary full-width">
                            <i class="fas fa-arrow-right"></i> 登录
                        </button>
                    </form>
                </div>
            </div>
        </AdminLayout>
    );
};
