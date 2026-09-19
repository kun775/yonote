## ADDED Requirements

### Requirement: 管理后台登录入口开关
系统 SHALL 提供两个互相独立的登录入口（管理密码、dex 单点登录），并 SHALL 允许两者同时关闭。

#### Scenario: 两个入口都可用
- **WHEN** `PASSWORD_ENABLED` 不为 `false` 且已配置 `ADMIN_PASSWORD`，同时 dex 凭据齐全且白名单非空
- **THEN** `/admin` 同时渲染密码表单与 dex 登录按钮

#### Scenario: 全部关闭时禁止登录
- **WHEN** 密码入口与 dex 入口均不可用
- **THEN** `/admin` 渲染「当前不可登录」说明与恢复方式，且不渲染任何登录表单
- **AND** `POST /admin/login` 返回 403，不提供任何绕过路径

#### Scenario: 入口按运行时配置求值
- **WHEN** 某个入口的环境变量被清空（例如删除 `DEX_CLIENT_SECRET`）
- **THEN** 该入口按钮从登录页消失，而不是渲染一个必然失败的按钮或表单

### Requirement: 关闭入口时同步失效已签发会话
系统 SHALL 在会话令牌中记录签发来源，并 SHALL 在鉴权时按当前开关回查；关闭某入口后该入口已签发的会话 MUST 立即失效。

#### Scenario: 密码入口关闭后旧会话失效
- **WHEN** 某会话由密码登录签发，随后 `PASSWORD_ENABLED` 被置为 `false`
- **THEN** 该会话不再通过鉴权，访问 `/admin/dashboard` 被重定向到 `/admin`

#### Scenario: 旧格式令牌兼容
- **WHEN** 浏览器持有升级前签发的旧格式会话令牌
- **THEN** 该令牌按密码会话解析，在密码入口仍开启时继续有效，不会因升级被强制登出

### Requirement: dex 单点登录
系统 SHALL 通过授权码 + PKCE(S256) 流程接入 dex，并 SHALL 校验 `state`、`nonce` 与 `id_token` 的签名、`iss`、`aud`、`exp`。

#### Scenario: 发起登录
- **WHEN** 用户访问 `/admin/sso/start`
- **THEN** 系统 302 到 dex 授权端点，携带 `client_id`、`redirect_uri`、`state`、`nonce`、`code_challenge` 与 `code_challenge_method=S256`
- **AND** 同时下发 HttpOnly、Secure、SameSite=Lax 的一次性 state Cookie

#### Scenario: 回调建立会话后必须立刻能进入后台
- **WHEN** dex 授权成功，回调校验通过并建立会话，随后 302 到 `/admin/dashboard`
- **THEN** 该会话 Cookie 为 `HttpOnly` + `Secure` + `SameSite=Lax`
- **AND** 不使用 `SameSite=Strict`：回调与其后的跳转同属一条由 dex 发起的跨站重定向链，`Strict` 会让刚下发的 Cookie 在下一跳不携带，表现为「授权成功却退回登录页且无错误提示」

#### Scenario: 回调地址必须精确登记
- **WHEN** dex 侧登记的 `redirectURIs` 不含 `<来源>/admin/sso/callback`
- **THEN** dex 在授权阶段即拒绝该请求；代码中的回调路径为常量 `DEX_CALLBACK_PATH`，由测试断言防止被顺手改动

#### Scenario: state 校验失败
- **WHEN** 回调请求缺少 state Cookie，或 `state` 参数与 Cookie 中的值不一致
- **THEN** 登录终止并重定向到 `/admin?error=sso_state`
- **AND** state Cookie 在成功与失败两条路径上都被清除

#### Scenario: 白名单判定
- **WHEN** 已验签身份的 `sub` 命中 `DEX_ALLOWED_SUBS`，或其 `preferred_username` 命中 `DEX_ALLOWED_USERS`
- **THEN** 建立 dex 来源的管理员会话并跳转 `/admin/dashboard`
- **AND** 邮箱仅在 `email_verified` 为真时参与 `DEX_ALLOWED_EMAILS` 匹配，且不做基于邮箱的账号合并

#### Scenario: 非白名单账号
- **WHEN** 已验签身份不在任何白名单内
- **THEN** 登录终止并重定向到 `/admin?error=sso_forbidden`，同时记录 `sub` / 用户名 / 邮箱用于排障

#### Scenario: 登出语义
- **WHEN** 用户点击退出登录
- **THEN** 仅清除本站管理员会话；dex 未提供 `end_session_endpoint`，dex 侧会话状态由 dex 决定
