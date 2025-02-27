# 在线共享笔记应用

一个简单但功能完整的在线笔记应用，支持 Markdown 格式，具有密码保护和内容加密功能。

## 在线预览
[https://note.1v23.com](https://note.1v23.com)

## 主要功能

### 基础功能
- 支持 Markdown 格式编辑和实时预览
- 自动保存
- 笔记内容加密存储
- 支持复制分享链接
- 支持下载笔记内容
- 响应式设计，支持移动端访问

### 安全特性
- 可选密码保护
- 支持公开/私密设置
- 密码错误次数限制
- 内容加密存储

### 笔记访问控制
- 完全公开：任何人都可以查看和编辑
- 受保护公开：任何人可以查看，需要密码才能编辑
- 私密：需要密码才能查看和编辑

## 部署说明

### 环境要求
- Python 3.7+
- SQLite3
- Flask

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置环境变量

```bash
export SECRET_KEY='your_secret_key'
export ENCRYPTION_KEY='your_encryption_key'
export ENCRYPTION_SALT='your_salt'
```

### 启动应用
```bash
python app.py
```

默认将在 `http://localhost:5005` 启动服务。

### Docker 部署
```bash
构建镜像
docker build -t yonote .
运行容器
docker run -d \
    -p 5005:5005 \
    -e SECRET_KEY='your_secret_key' \
    -e ENCRYPTION_KEY='your_encryption_key' \
    -e ENCRYPTION_SALT='your_salt' \
    -v /path/to/data:/app/data \
yonote
```

或者使用已编译好的docker
```yaml
services:
    yonote:
      image: huangsk/yonote:latest #arm系统就使用huangsk/yonote-arm:latest
      container_name: yonote
      restart: always
      ports:
        - "5505:5005"
      environment:
        - SECRET_KEY='your_secret_key'
        - ENCRYPTION_KEY='your_encryption_key'
        - ENCRYPTION_SALT='your_salt'
      volumes:
        - ./data:/app/data
        - ./logs:/app/logs
```


## 使用说明

1. 访问首页自动创建新笔记
2. 编辑笔记内容（支持 Markdown 格式）
3. 可选设置密码保护和访问权限
4. 通过分享链接与他人分享笔记
5. 可以随时下载笔记内容

### Markdown 支持
- 目录[TOC]
- 标题（H1-H6）
- 列表（有序/无序）
- 代码块（支持语法高亮）
- 表格
- 链接和图片
- 粗体和斜体
- 公式

请参考[markdown](https://note.1v23.com/markdown?view=1)

## 安全建议
- 建议使用强密码保护重要笔记
- 定期更改笔记密码
- 不建议存储高度敏感信息
- 及时删除不再需要的笔记

## 开发计划
- [ ] 支持笔记标签
- [ ] 添加笔记历史版本
- [ ] 支持更多 Markdown 扩展
- [ ] 添加笔记分类功能
- [ ] 支持文件附件

## 许可证
GPL License
