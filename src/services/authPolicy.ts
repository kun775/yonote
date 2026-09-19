import type { Bindings } from '../types';
import { getDexConfigStatus, type DexConfigStatus } from './dex';

// 管理后台登录入口策略
//
// 两个入口互相独立，四种组合都要能跑通：
//   仅密码 / 仅 dex / 两者都开 / 两者都关（整体锁闭是合法配置）
// 关闭某入口时，该入口已签发的会话一并失效，见 middleware/session.ts 的会话来源标记。

/** 密码入口签发的会话 */
export const AUTH_MODE_PASSWORD = 'p';
/** dex 单点登录签发的会话 */
export const AUTH_MODE_DEX = 'd';

export type AuthMode = typeof AUTH_MODE_PASSWORD | typeof AUTH_MODE_DEX;

export interface AuthPolicy {
    /** 密码入口最终是否可用（开关打开且已配置 ADMIN_PASSWORD） */
    passwordEnabled: boolean;
    /** dex 入口最终是否可用（凭据齐全且白名单非空） */
    dexEnabled: boolean;
    /** 是否至少有一个可用入口 */
    anyEnabled: boolean;
    /** PASSWORD_ENABLED 开关的原始取值 */
    passwordSwitchOn: boolean;
    /** ADMIN_PASSWORD 是否已配置 */
    passwordConfigured: boolean;
    /** dex 配置完整度，用于提示与排障 */
    dexStatus: DexConfigStatus;
}

function readSwitch(value: string | undefined, fallback: boolean): boolean {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

// getAuthPolicy 汇总两个登录入口的可用性
//
// 参数:
//   - env Bindings: Worker 环境变量
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化入口策略聚合；PASSWORD_ENABLED 缺省为 true 以保持既有部署行为。
export function getAuthPolicy(env: Bindings): AuthPolicy {
    const passwordSwitchOn = readSwitch(env.PASSWORD_ENABLED, true);
    const passwordConfigured = Boolean(env.ADMIN_PASSWORD?.trim());
    const passwordEnabled = passwordSwitchOn && passwordConfigured;

    const dexStatus = getDexConfigStatus(env);
    const dexEnabled = dexStatus === 'ready';

    return {
        passwordEnabled,
        dexEnabled,
        anyEnabled: passwordEnabled || dexEnabled,
        passwordSwitchOn,
        passwordConfigured,
        dexStatus
    };
}

// isAuthModeEnabled 判断某一会话来源当前是否仍然放行
//
// 参数:
//   - policy AuthPolicy: 当前入口策略
//   - mode AuthMode: 会话签发来源
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化会话来源放行判定，用于关闭入口时同步失效已签发会话。
export function isAuthModeEnabled(policy: AuthPolicy, mode: AuthMode): boolean {
    return mode === AUTH_MODE_DEX ? policy.dexEnabled : policy.passwordEnabled;
}

// describeAuthStatus 生成整体锁闭时的原因与恢复提示
//
// 参数:
//   - policy AuthPolicy: 当前入口策略
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-09-19
//   - 更新时间: 2026-09-19
//   - 更新内容: 初始化锁闭原因文案，避免用户误判为密码错误。
export function describeAuthStatus(policy: AuthPolicy): string {
    const reasons: string[] = [];

    if (!policy.passwordSwitchOn) {
        reasons.push('密码登录已通过 PASSWORD_ENABLED=false 关闭');
    } else if (!policy.passwordConfigured) {
        reasons.push('管理密码（ADMIN_PASSWORD）未配置');
    }

    if (policy.dexStatus === 'unconfigured') {
        reasons.push('dex 单点登录未配置');
    } else if (policy.dexStatus === 'incomplete-credentials') {
        reasons.push('dex 凭据不完整（缺少 DEX_ISSUER / DEX_CLIENT_ID / DEX_CLIENT_SECRET 中的一项）');
    } else if (policy.dexStatus === 'missing-allowlist') {
        reasons.push('dex 白名单为空（DEX_ALLOWED_SUBS 等均为空）');
    }

    return reasons.join('；');
}
