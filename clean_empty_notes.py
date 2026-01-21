#!/usr/bin/env python3

import base64
import logging
import os
import sqlite3
import time
from datetime import datetime

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", filename="clean_notes.log"
)
logger = logging.getLogger("clean_empty_notes")

# 数据库路径
DB_PATH = "/app/data/notes.db"

# 加密相关配置（与主应用保持一致）
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "this_is_a_secret_key_please_change_in_production")
SALT = os.environ.get("ENCRYPTION_SALT", "static_salt_change_this").encode()


def get_encryption_key():
    """从环境变量生成加密密钥"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
    return key


def decrypt_content(encrypted_content):
    """解密笔记内容"""
    if not encrypted_content:
        return ""

    try:
        f = Fernet(get_encryption_key())
        decrypted = f.decrypt(encrypted_content.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error(f"解密错误: {e}")
        return "[解密失败]"


def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def clean_empty_notes():
    """清理空笔记"""
    logger.info("开始清理空笔记...")

    # 获取当前时间戳
    current_time = int(time.time())
    # 计算24小时前的时间戳
    one_day_ago = current_time - (24 * 60 * 60)

    conn = get_db_connection()
    try:
        # 获取所有笔记
        notes = conn.execute("SELECT * FROM notes").fetchall()

        empty_notes_count = 0
        for note in notes:
            content = ""
            # 解密内容
            if note["encrypted"]:
                content = decrypt_content(note["content"])
            else:
                content = note["content"]

            # 检查内容是否为空且创建时间超过24小时
            if (not content or content.strip() == "") and note["created_at"] < one_day_ago:
                # 删除空笔记
                conn.execute("DELETE FROM notes WHERE key = ?", (note["key"],))
                empty_notes_count += 1
                logger.info(f"已删除空笔记: {note['key']}, 创建于: {datetime.fromtimestamp(note['created_at'])}")

        conn.commit()
        logger.info(f"清理完成，共删除 {empty_notes_count} 个空笔记")
    except Exception as e:
        logger.error(f"清理过程中发生错误: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    clean_empty_notes()
