from flask import Flask, request, render_template, redirect, url_for, flash, abort, jsonify, session, make_response
import sqlite3
import hashlib
import secrets
import os
import string
import random
from datetime import datetime
from markupsafe import Markup
import time
import markdown
import requests  # 用于获取随机单词
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev_key_please_change')
DB_PATH = 'data/notes.db'

# 添加访问速率限制
limiter = Limiter(
    key_func=get_remote_address,  # 使用 key_func 而不是直接传递函数
    app=app,
    default_limits=["2000000 per day", "50000 per hour"],
    storage_uri="memory://",
)

# 密码错误计数器
password_attempts = {}
MAX_PASSWORD_ATTEMPTS = 5  # 最大密码尝试次数
PASSWORD_LOCKOUT_TIME = 30 * 60  # 锁定时间（秒）

# 加密相关
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

def decrypt_content(encrypted_content):
    """解密笔记内容"""
    if not encrypted_content:
        return ""
    
    try:
        f = Fernet(get_encryption_key())
        decrypted = f.decrypt(encrypted_content.encode())
        return decrypted.decode()
    except Exception as e:
        print(f"解密错误: {e}")
        return "[解密失败]"

# 添加nl2br过滤器
@app.template_filter('nl2br')
def nl2br_filter(s):
    if s:
        s = s.replace('\n', Markup('<br>'))
    return Markup(s)

# 添加markdown过滤器
@app.template_filter('markdown')
def markdown_filter(s):
    if s:
        # 使用Python-Markdown库解析markdown
        return Markup(markdown.markdown(s, extensions=['extra', 'codehilite', 'tables']))
    return Markup('')

# 添加时间格式化过滤器
@app.template_filter('time_ago')
def time_ago_filter(timestamp):
    try:
        # 计算时间差（秒）
        seconds_ago = int(time.time() - timestamp)
        
        if seconds_ago < 60:
            return f"{seconds_ago}秒前"
        elif seconds_ago < 3600:
            return f"{seconds_ago // 60}分钟前"
        elif seconds_ago < 86400:
            return f"{seconds_ago // 3600}小时前"
        elif seconds_ago < 604800:
            return f"{seconds_ago // 86400}天前"
        else:
            dt = datetime.fromtimestamp(timestamp)
            return dt.strftime('%Y-%m-%d %H:%M')
    except:
        return "未知时间"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        password TEXT,
        public BOOLEAN DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        encrypted BOOLEAN DEFAULT 1
    )
    ''')
    # 添加锁定表
    conn.execute('''
    CREATE TABLE IF NOT EXISTS lockouts (
        key TEXT PRIMARY KEY,
        ip_address TEXT NOT NULL,
        locked_until INTEGER NOT NULL
    )
    ''')
    conn.commit()
    conn.close()

with app.app_context():
    init_db()

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def generate_word_key(min_length=3, max_length=7):
    """生成一个3-7字符的英文单词作为key"""
    chars = string.ascii_lowercase
    while True:
        length = random.randint(min_length, max_length)
        key = ''.join(random.choice(chars) for _ in range(length))
        
        # 检查是否已存在
        conn = get_db_connection()
        existing = conn.execute('SELECT key FROM notes WHERE key = ?', (key,)).fetchone()
        conn.close()
        
        if not existing:
            return key

# 会话管理函数
def is_authenticated(key):
    """检查用户是否已经通过了特定笔记的密码验证"""
    auth_keys = session.get('authenticated_keys', {})
    return auth_keys.get(key, False)

def set_authenticated(key):
    """设置用户已通过特定笔记的密码验证"""
    auth_keys = session.get('authenticated_keys', {})
    auth_keys[key] = True
    session['authenticated_keys'] = auth_keys

def remove_authentication(key):
    """移除特定笔记的认证状态"""
    auth_keys = session.get('authenticated_keys', {})
    if key in auth_keys:
        del auth_keys[key]
        session['authenticated_keys'] = auth_keys

@app.before_request
def before_request():
    init_db()

@app.route('/')
def index():
    # 自动创建新笔记并重定向
    key = generate_word_key()
    current_time = int(time.time())
    
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO notes (key, content, public, created_at, updated_at, encrypted) VALUES (?, ?, ?, ?, ?, ?)',
        (key, '', 0, current_time, current_time, 1)
    )
    conn.commit()
    conn.close()
    
    # 直接设置为已认证状态，避免可能的密码提示
    set_authenticated(key)
    
    # 添加查询参数，表明这是新创建的笔记
    return redirect(url_for('view_note', key=key, new=1))

@app.route('/<key>', methods=['GET'])
def view_note(key):
    if len(key) > 128:
        return redirect(url_for('index'))
    
    view_only = 'view' in request.args  # 只有明确请求查看模式时才是只读
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    
    # 如果笔记不存在，使用用户输入的key创建新笔记
    if not note:
        current_time = int(time.time())
        conn.execute(
            'INSERT INTO notes (key, content, public, created_at, updated_at, encrypted) VALUES (?, ?, ?, ?, ?, ?)',
            (key, '', 0, current_time, current_time, 1)
        )
        conn.commit()
        note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
        # 为新创建的笔记设置认证状态
        set_authenticated(key)
    
    # 解密笔记内容
    decrypted_content = ""
    if note['encrypted']:
        decrypted_content = decrypt_content(note['content'])
    else:
        decrypted_content = note['content']
    
    # 创建一个新的字典，包含解密后的内容
    note_dict = dict(note)
    note_dict['content'] = decrypted_content
    
    conn.close()
    
    # 检查认证状态
    authenticated = is_authenticated(key)
    
    # 如果有密码保护且未认证，显示密码输入界面（除非是公开笔记且请求只读模式）
    if note_dict['password'] and not authenticated:
        if note_dict['public'] and view_only:
            return render_template('view.html', note=note_dict, view_only=True, authenticated=False)
        else:
            return render_template('password.html', key=key, next_url=f'/{key}', is_public=note_dict['public'])
    
    # 如果明确请求查看模式，则以只读方式显示
    if view_only:
        return render_template('view.html', note=note_dict, view_only=True, authenticated=authenticated)
    
    # 默认进入编辑模式
    return render_template('view.html', note=note_dict, view_only=False, authenticated=True)

@app.route('/<key>/verify', methods=['POST'])
def verify_password(key):
    password = request.form.get('password', '')
    next_url = request.form.get('next_url', f'/{key}')
    ip_address = get_remote_address()
    
    # 检查是否被锁定
    is_locked, locked_until = is_locked_out(key, ip_address)
    if is_locked:
        remaining = int(locked_until - time.time())
        flash(f'由于多次密码错误，请等待{remaining}秒后再试')
        return redirect(url_for('view_note', key=key))
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    conn.close()
    
    if not note:
        abort(404)
    
    # 获取当前笔记的密码尝试次数
    attempt_key = f"{key}:{ip_address}"
    attempts = password_attempts.get(attempt_key, 0)
    
    hashed_input = hash_password(password)
    if note['password'] == hashed_input:
        # 密码正确，重置尝试次数
        if attempt_key in password_attempts:
            del password_attempts[attempt_key]
        # 清除可能存在的锁定
        clear_lockout(key, ip_address)
        # 使用会话存储认证状态
        set_authenticated(key)
        return redirect(next_url)
    else:
        # 密码错误，增加尝试次数
        attempts += 1
        password_attempts[attempt_key] = attempts
        
        # 检查是否超过最大尝试次数
        if attempts >= MAX_PASSWORD_ATTEMPTS:
            # 锁定账户
            locked_until = add_lockout(key, ip_address)
            # 重置尝试次数
            del password_attempts[attempt_key]
            remaining = int(locked_until - time.time())
            flash(f'由于多次密码错误，请等待{remaining}秒后再试')
        else:
            remaining = MAX_PASSWORD_ATTEMPTS - attempts
            flash(f'密码错误，还有{remaining}次尝试机会')
            
        return redirect(url_for('view_note', key=key))

@app.route('/<key>/update', methods=['POST'])
def update_note(key):
    content = request.form.get('content', '')
    password_action = request.form.get('password_action', 'keep')
    new_password = request.form.get('new_password', '')
    public = 1 if request.form.get('public') else 0
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    
    if not note:
        conn.close()
        abort(404)
    
    # 安全检查：如果笔记有密码保护，确保用户已通过验证
    if note['password'] and not is_authenticated(key):
        conn.close()
        flash('未授权的操作')
        return redirect(url_for('view_note', key=key))
    
    # 处理密码
    if password_action == 'keep':
        updated_password = note['password']
    elif password_action == 'remove':
        updated_password = None
        # 如果移除密码，笔记不能是公开的
        public = 0
    elif password_action == 'change':  # 移除内容检查
        updated_password = hash_password(new_password) if new_password else None
    else:
        updated_password = note['password']
    
    # 如果没有密码，笔记不能是公开的（必须是完全公开）
    if not updated_password:
        public = 0
    
    # 加密内容
    encrypted_content = encrypt_content(content)
    
    current_time = int(time.time())
    conn.execute(
        'UPDATE notes SET content = ?, password = ?, public = ?, updated_at = ?, encrypted = ? WHERE key = ?',
        (encrypted_content, updated_password, public, current_time, 1, key)
    )
    conn.commit()
    conn.close()
    
    # 如果更改了密码，更新认证状态
    if password_action != 'keep':
        if updated_password:
            set_authenticated(key)
        else:
            # 如果删除了密码，不需要认证
            remove_authentication(key)
    
    return redirect(url_for('view_note', key=key))

@app.route('/<key>/auto-save', methods=['POST'])
def auto_save(key):
    data = request.get_json(silent=True)  # silent=True 防止出现400错误
    if data is None:
        return jsonify({'error': '无效的JSON数据'}), 400
    
    content = data.get('content', '')
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    
    if not note:
        conn.close()
        return jsonify({'status': 'error', 'message': '笔记不存在'}), 404
    
    # 安全检查：如果笔记有密码保护，确保用户已通过验证
    if note['password'] and not is_authenticated(key):
        conn.close()
        return jsonify({'status': 'error', 'message': '未授权的操作'}), 403
    
    # 加密内容
    encrypted_content = encrypt_content(content)
    
    current_time = int(time.time())
    conn.execute(
        'UPDATE notes SET content = ?, updated_at = ?, encrypted = ? WHERE key = ?',
        (encrypted_content, current_time, 1, key)
    )
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'message': '自动保存成功', 'timestamp': current_time})

@app.route('/render-markdown', methods=['POST'])
def render_markdown():
    """实时渲染Markdown内容"""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': '无效的JSON数据'}), 400
        
    content = data.get('content', '')
    
    # 配置 Markdown 扩展和选项
    extensions = [
        'markdown.extensions.extra',        # 包含tables等扩展
        'markdown.extensions.codehilite',   # 代码高亮
        'markdown.extensions.nl2br',        # 换行转换为<br>
        'markdown.extensions.sane_lists',   # 更智能的列表
        'markdown.extensions.meta',         # 元数据
        'markdown.extensions.tables',       # 明确包含表格扩展
        'markdown.extensions.toc',          # 目录
    ]
    
    # 使用markdown库渲染内容
    html = markdown.markdown(
        content,
        extensions=extensions,
        output_format='html'
    )
    
    return jsonify({'html': html})

@app.route('/<key>/get-timestamp', methods=['GET'])
def get_timestamp(key):
    """获取笔记的最后更新时间戳"""
    conn = get_db_connection()
    note = conn.execute('SELECT updated_at FROM notes WHERE key = ?', (key,)).fetchone()
    conn.close()
    
    if not note:
        return jsonify({'error': '笔记不存在'}), 404
    
    timestamp = note['updated_at']
    time_ago = time_ago_filter(timestamp)
    
    return jsonify({
        'timestamp': timestamp,
        'time_ago': time_ago
    })

@app.route('/<key>/verify-delete', methods=['POST'])
def verify_delete_password(key):
    """验证删除笔记的密码"""
    data = request.get_json(silent=True)  # silent=True 防止出现400错误
    if data is None:
        return jsonify({'error': '无效的JSON数据'}), 400
    
    password = data.get('password', '')
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    conn.close()
    
    if not note:
        return jsonify({'success': False, 'message': '笔记不存在'})
    
    if not note['password']:
        return jsonify({'success': True})
    
    hashed_input = hash_password(password)
    if note['password'] == hashed_input:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': '密码错误'})

@app.route('/<key>/delete', methods=['GET'])
def delete_note(key):
    """删除笔记"""
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    
    if not note:
        conn.close()
        flash('笔记不存在')
        return redirect(url_for('index'))
    
    # 如果笔记有密码保护，确保用户已通过验证
    if note['password'] and not is_authenticated(key):
        conn.close()
        flash('未授权的操作')
        return redirect(url_for('view_note', key=key))
    
    # 执行删除
    conn.execute('DELETE FROM notes WHERE key = ?', (key,))
    conn.commit()
    conn.close()
    
    # 清除会话中的认证信息
    remove_authentication(key)
    
    flash('笔记已成功删除')
    return redirect(url_for('index'))

@app.route('/<key>/verify-download', methods=['POST'])
def verify_download_password(key):
    """验证下载笔记的密码"""
    data = request.get_json(silent=True)  # silent=True 防止出现400错误
    if data is None:
        return jsonify({'error': '无效的JSON数据'}), 400
    
    password = data.get('password', '')
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    conn.close()
    
    if not note:
        return jsonify({'success': False, 'message': '笔记不存在'})
    
    if not note['password']:
        return jsonify({'success': True})
    
    hashed_input = hash_password(password)
    if note['password'] == hashed_input:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': '密码错误'})

@app.route('/<key>/download', methods=['GET'])
def download_note(key):
    """下载笔记为txt文件"""
    password = request.args.get('password', '')
    
    conn = get_db_connection()
    note = conn.execute('SELECT * FROM notes WHERE key = ?', (key,)).fetchone()
    
    if not note:
        conn.close()
        abort(404)
    
    # 检查权限
    authenticated = is_authenticated(key)
    
    # 如果笔记有密码保护且不公开，需要验证密码
    if note['password'] and not note['public'] and not authenticated:
        if password:
            hashed_input = hash_password(password)
            if note['password'] != hashed_input:
                conn.close()
                abort(403)
        else:
            conn.close()
            abort(403)
    
    # 解密笔记内容
    content = ""
    if note['encrypted']:
        content = decrypt_content(note['content'])
    else:
        content = note['content']
    
    conn.close()
    
    # 创建响应
    response = make_response(content)
    response.headers['Content-Disposition'] = f'attachment; filename={key}.txt'
    response.headers['Content-Type'] = 'text/plain; charset=utf-8'
    
    return response

@app.route('/favicon.ico')
def favicon():
    """提供网站图标"""
    return app.send_static_file('favicon.ico')

def is_locked_out(key, ip_address):
    """检查是否被锁定"""
    conn = get_db_connection()
    lockout = conn.execute('SELECT locked_until FROM lockouts WHERE key = ? AND ip_address = ?', 
                          (key, ip_address)).fetchone()
    conn.close()
    
    if lockout and lockout['locked_until'] > time.time():
        return True, lockout['locked_until']
    return False, 0

def add_lockout(key, ip_address):
    """添加锁定记录"""
    locked_until = int(time.time()) + PASSWORD_LOCKOUT_TIME
    conn = get_db_connection()
    conn.execute('INSERT OR REPLACE INTO lockouts (key, ip_address, locked_until) VALUES (?, ?, ?)',
                (key, ip_address, locked_until))
    conn.commit()
    conn.close()
    return locked_until

def clear_lockout(key, ip_address):
    """清除锁定记录"""
    conn = get_db_connection()
    conn.execute('DELETE FROM lockouts WHERE key = ? AND ip_address = ?', (key, ip_address))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)