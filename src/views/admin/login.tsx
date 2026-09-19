import type { FC } from 'hono/jsx';
import { AdminLayout } from '../layouts/base';
import { describeAuthStatus, type AuthPolicy } from '../../services/authPolicy';

interface LoginPageProps {
    /** 当前登录入口策略 */
    policy: AuthPolicy;
    /** 直接指定的错误文案（密码校验、限流等本地错误） */
    error?: string;
    /** 由 /admin?error=<code> 传入的错误码，映射为可读文案 */
    errorCode?: string;
}

// 统一错误码文案：不直接把原始错误码或堆栈展示给用户
const AUTH_ERROR_MESSAGES: Record<string, string> = {
    sso_unavailable: 'dex 单点登录当前不可用，请联系管理员检查配置',
    sso_state: '登录会话已过期或校验失败，请重新发起登录',
    sso_failed: 'dex 登录失败，请重新发起登录',
    sso_forbidden: '当前 dex 账号不在管理员白名单内',
    sso_denied: '你已取消 dex 授权'
};

// resolveAuthErrorMessage 将错误码映射为可读文案
//
// 参数:
//   - errorCode string | undefined: URL 中的 error 参数
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化认证错误码文案映射。
export function resolveAuthErrorMessage(errorCode?: string): string | undefined {
    if (!errorCode) {
        return undefined;
    }
    return AUTH_ERROR_MESSAGES[errorCode] ?? '登录失败，请重试';
}

export const AdminLoginPage: FC<LoginPageProps> = ({ policy, error, errorCode }) => {
    const message = error ?? resolveAuthErrorMessage(errorCode);
    const bothEntriesAvailable = policy.passwordEnabled && policy.dexEnabled;

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
                    {message && (
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>{message}</span>
                        </div>
                    )}
                    {policy.anyEnabled ? (
                        <>
                            {policy.passwordEnabled && (
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
                            )}
                            {bothEntriesAvailable && (
                                <div class="login-divider">
                                    <span>或</span>
                                </div>
                            )}
                            {policy.dexEnabled && (
                                <a class="btn secondary full-width" href="/admin/sso/start">
                                    <i class="fas fa-id-card"></i> 使用 dex 单点登录
                                </a>
                            )}
                        </>
                    ) : (
                        <div class="login-notice">
                            <p class="login-notice-title">
                                <i class="fas fa-ban"></i> 当前不可登录
                            </p>
                            <p>原因：{describeAuthStatus(policy)}。</p>
                            <p>恢复方式：打开密码登录开关（PASSWORD_ENABLED=true），或补全 dex 单点登录配置后重新部署。</p>
                            {policy.passwordSwitchOn && !policy.passwordConfigured && (
                                <p>
                                    首次部署可直接访问 <a href="/admin/setup">/admin/setup</a> 生成 ADMIN_PASSWORD 哈希。
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};
