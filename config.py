import os
from datetime import timedelta


class Config:
    # 基础配置
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev_key_please_change"  # secrets.token_hex(32)

    # 数据库配置
    DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notes.db")

    # 加密配置
    ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY") or "this_is_a_secret_key_please_change_in_production"
    ENCRYPTION_SALT = os.environ.get("ENCRYPTION_SALT") or "static_salt_change_this"

    # 会话配置
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)

    # 认证配置
    TOKEN_EXPIRY = timedelta(hours=24)

    # 内容安全策略
    CSP = {
        "default-src": "'self'",
        "script-src": "'self' https://cdnjs.cloudflare.com",
        "style-src": "'self' https://cdnjs.cloudflare.com 'unsafe-inline'",
        "img-src": "'self' data:",
        "font-src": "'self' https://cdnjs.cloudflare.com",
        "connect-src": "'self'",
        "frame-src": "'none'",
        "object-src": "'none'",
    }
