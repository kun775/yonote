# YoNote

一个轻量级的在线 Markdown 笔记应用，支持实时预览、自动保存、密码保护和内容加密。

## 功能特性

- **即时创建**: 无需注册，访问即可创建笔记
- **实时预览**: 左右分栏编辑/预览 (PC)，切换模式 (移动端)
- **自动保存**: 输入停止 1 秒后自动保存
- **Markdown 增强**: 支持任务列表、脚注、高亮、上标/下标
- **代码高亮**: 支持多种编程语言语法高亮
- **数学公式**: 支持 KaTeX/MathJax 数学公式渲染
- **密码保护**: 可设置密码保护笔记
- **内容加密**: 使用 Fernet (AES) 加密存储
- **响应式设计**: 适配桌面和移动设备

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Flask 2.0.1 |
| 数据库 | SQLite 3 |
| 加密 | Fernet (PBKDF2HMAC + AES) |
| XSS 防护 | bleach (HTML 清理) |
| Markdown | Python-Markdown + pymdown-extensions |
| 前端渲染 | Marked.js, KaTeX, Highlight.js |
| 容器化 | Docker + Supervisor |

## 快速开始

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/yonote.git
cd yonote

# 安装依赖
pip install -r requirements.txt

# 运行开发服务器
python app.py
# 服务运行在 http://localhost:5005
```

### Docker 部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker logs -f yonote
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SECRET_KEY` | Flask 会话密钥 | `dev_key_please_change` |
| `ENCRYPTION_KEY` | 笔记加密密钥 | (请修改默认值) |
| `ENCRYPTION_SALT` | 加密盐值 | (请修改默认值) |

> 生产环境请务必修改以上默认值

## API 接口

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 创建新笔记并重定向 |
| `/<key>` | GET | 查看/编辑笔记 |
| `/<key>/update` | POST | 更新笔记内容和设置 |
| `/<key>/auto-save` | POST | 自动保存 (JSON) |
| `/<key>/verify` | POST | 验证笔记密码 |
| `/<key>/delete` | GET | 删除笔记 |
| `/<key>/download` | GET | 下载笔记为 txt |
| `/render-markdown` | POST | 服务端 Markdown 渲染 |

## 安全机制

- **内容加密**: 使用 Fernet 对笔记内容进行 AES 加密存储
- **密码保护**: 笔记可设置 SHA256 哈希密码
- **访问控制**: 三种模式 - 公开、受保护公开、私有
- **暴力破解防护**: 5 次错误锁定 30 分钟
- **速率限制**: 每日 2,000,000 / 每小时 50,000 请求上限
- **XSS 防护**: 使用 bleach 库清理 HTML 输出

## 项目结构

```
yonote/
├── app.py                    # Flask 主应用
├── config.py                 # 配置类
├── requirements.txt          # Python 依赖
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
├── templates/
│   ├── view.html             # 笔记主视图模板
│   └── password.html         # 密码验证页面
├── static/
│   ├── app.js                # 前端主逻辑
│   ├── function.js           # 工具函数
│   └── style.css             # 样式表
└── data/
    └── notes.db              # SQLite 数据库
```

## 开发指南

### 代码检查

```bash
# 安装 Ruff
pip install ruff

# 代码检查
ruff check .

# 格式检查
ruff format --check .

# 自动修复
ruff check --fix .
```

### 编码规范

- **Python**: 遵循 PEP 8，使用中文注释
- **JavaScript**: ES6+ 语法，使用 `const`/`let`
- **CSS**: BEM 命名风格，响应式优先

## CI/CD

项目使用 GitHub Actions 实现自动化：

- **CI 流程**: 代码检查 (Ruff)、安全扫描 (Bandit/Safety)、测试 (pytest)
- **Docker 流程**: 自动构建并推送到 GitHub Container Registry

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
