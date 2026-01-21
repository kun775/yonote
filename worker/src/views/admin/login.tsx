import type { FC } from 'hono/jsx';
import { AdminLayout } from '../layouts/base';

interface LoginPageProps {
    error?: string;
}

export const AdminLoginPage: FC<LoginPageProps> = ({ error }) => {
    return (
        <AdminLayout title="登录">
            <div class="login-form">
                <h2><i class="fas fa-lock"></i> 管理后台</h2>
                {error && <div class="error-message">{error}</div>}
                <form method="post" action="/admin/login">
                    <input
                        type="password"
                        name="password"
                        placeholder="请输入管理密码"
                        required
                        autofocus
                    />
                    <button type="submit">登录</button>
                </form>
            </div>
        </AdminLayout>
    );
};
