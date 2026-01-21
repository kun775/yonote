import base64
import os
import sqlite3

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

DB_PATH = 'notes.db'
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'this_is_a_secret_key_please_change_in_production')
SALT = os.environ.get('ENCRYPTION_SALT', 'static_salt_change_this').encode()

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

def encrypt_content(content):
    """加密笔记内容"""
    if not content:
        return ""

    f = Fernet(get_encryption_key())
    encrypted = f.encrypt(content.encode())
    return encrypted.decode()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def migrate_database():
    """迁移数据库，添加encrypted字段并加密现有内容"""
    conn = get_db_connection()

    # 检查是否已有encrypted字段
    cursor = conn.execute("PRAGMA table_info(notes)")
    columns = [column[1] for column in cursor.fetchall()]

    if 'encrypted' not in columns:
        print("添加encrypted字段...")
        conn.execute("ALTER TABLE notes ADD COLUMN encrypted BOOLEAN DEFAULT 0")
        conn.commit()

    # 获取所有未加密的笔记
    notes = conn.execute("SELECT id, key, content FROM notes WHERE encrypted = 0 OR encrypted IS NULL").fetchall()

    print(f"找到 {len(notes)} 条未加密笔记")

    # 加密每条笔记
    for note in notes:
        print(f"加密笔记 {note['key']}...")
        encrypted_content = encrypt_content(note['content'])
        conn.execute(
            "UPDATE notes SET content = ?, encrypted = 1 WHERE id = ?",
            (encrypted_content, note['id'])
        )

    conn.commit()
    conn.close()
    print("迁移完成！")

if __name__ == "__main__":
    migrate_database()
