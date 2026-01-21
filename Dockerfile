FROM python:3.9-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    cron \
    logrotate \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir supervisor

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data && \
    chmod 777 /app/data

# 创建日志目录
RUN mkdir -p /app/logs && \
    chmod 777 /app/logs

RUN mkdir -p /etc/supervisor/conf.d

# 添加清理脚本
COPY clean_empty_notes.py /app/
RUN chmod +x /app/clean_empty_notes.py

# 设置 crontab
RUN echo "0 3 * * * cd /app && python /app/clean_empty_notes.py >> /app/logs/cron.log 2>&1" > /etc/cron.d/clean-notes && \
    chmod 0644 /etc/cron.d/clean-notes && \
    crontab /etc/cron.d/clean-notes

# 配置日志轮转
RUN echo "/app/logs/*.log {\n\
    daily\n\
    rotate 7\n\
    compress\n\
    delaycompress\n\
    missingok\n\
    notifempty\n\
    create 0644 root root\n\
    sharedscripts\n\
    postrotate\n\
        supervisorctl signal HUP all >/dev/null 2>&1 || true\n\
    endscript\n\
}" > /etc/logrotate.d/app-logs && \
    chmod 0644 /etc/logrotate.d/app-logs && \
    echo "0 0 * * * /usr/sbin/logrotate /etc/logrotate.d/app-logs --state /app/logrotate-state" >> /etc/cron.d/clean-notes

# 创建 supervisor 配置
RUN echo "[supervisord]\nnodaemon=true\n\n\
[program:flask]\ncommand=python app.py\ndirectory=/app\nautostart=true\nautorestart=true\nstdout_logfile=/app/logs/flask.log\nstderr_logfile=/app/logs/flask_error.log\n\n\
[program:cron]\ncommand=cron -f\nautostart=true\nautorestart=true\nstdout_logfile=/app/logs/cron.log\nstderr_logfile=/app/logs/cron_error.log" > /etc/supervisor/conf.d/supervisord.conf

# 设置环境变量
ENV SECRET_KEY="change_this_in_production"
ENV ENCRYPTION_KEY="change_this_in_production"
ENV ENCRYPTION_SALT="change_this_in_production"

# 暴露端口
EXPOSE 5005

# 启动 supervisor
CMD ["/usr/local/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]