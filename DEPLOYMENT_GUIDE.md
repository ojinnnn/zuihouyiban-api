# VPS 部署指南 - oai-reverse-proxy

本指南将帮助您在通用 VPS (如 DigitalOcean, Vultr, Linode 等) 上使用 Docker 部署 oai-reverse-proxy 项目。

## 前置要求

- 一台运行 Ubuntu 20.04 或更高版本的 VPS
- 至少 1GB RAM 和 20GB 存储空间
- SSH 访问权限
- 一个域名（可选，但推荐用于 HTTPS）

## 部署步骤

### 第 1 步：连接到您的 VPS

```bash
ssh root@your-vps-ip
```

### 第 2 步：更新系统并安装必要的软件

```bash
# 更新软件包列表
apt update && apt upgrade -y

# 安装基本工具
apt install -y curl git vim
```

### 第 3 步：安装 Docker 和 Docker Compose

```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 安装 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 第 4 步：克隆您的项目仓库

```bash
# 创建应用目录
mkdir -p /opt/apps
cd /opt/apps

# 克隆您的仓库
git clone https://github.com/ojinnnn/zuihouyiban-api.git
cd zuihouyiban-api
```

### 第 5 步：创建环境变量文件

创建 `.env` 文件并添加您的 API 密钥：

```bash
vim .env
```

添加以下内容（请替换为您的实际 API 密钥）：

```env
# 服务器配置
PORT=7860
LOG_LEVEL=info

# 管理员配置
ADMIN_KEY=your_admin_key_here

# OpenAI API 密钥
OPENAI_KEY=sk-your-openai-key-here

# Anthropic API 密钥  
ANTHROPIC_KEY=sk-ant-your-anthropic-key-here

# Google AI API 密钥
GOOGLE_AI_KEY=your-google-ai-key-here

# AWS 配置（如果使用 AWS Claude）
AWS_CREDENTIALS=your-aws-credentials-here

# 其他可选配置
PROXY_KEY=your-proxy-key-here
GATEKEEPER=proxy_key
ALLOWED_MODEL_FAMILIES=claude,gpt,gemini
```

### 第 6 步：配置 Docker Compose

项目已包含 `docker/docker-compose-selfhost.yml` 文件。让我们使用它：

```bash
# 进入 docker 目录
cd docker

# 使用自托管配置启动服务
docker-compose -f docker-compose-selfhost.yml up -d
```

### 第 7 步：配置防火墙

```bash
# 安装 ufw（如果尚未安装）
apt install -y ufw

# 允许 SSH（重要！）
ufw allow 22/tcp

# 允许代理服务端口
ufw allow 7860/tcp

# 如果使用 HTTPS，还需要允许 443
ufw allow 443/tcp

# 启用防火墙
ufw --force enable
```

### 第 8 步：（可选）配置 Nginx 反向代理和 SSL

如果您有域名并希望使用 HTTPS：

```bash
# 安装 Nginx 和 Certbot
apt install -y nginx certbot python3-certbot-nginx

# 创建 Nginx 配置
vim /etc/nginx/sites-available/oai-proxy
```

添加以下配置（替换 `your-domain.com`）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:7860;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 增加超时时间，适合 AI API 调用
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }
}
```

启用配置并获取 SSL 证书：

```bash
# 启用站点
ln -s /etc/nginx/sites-available/oai-proxy /etc/nginx/sites-enabled/

# 测试 Nginx 配置
nginx -t

# 重新加载 Nginx
systemctl reload nginx

# 获取 SSL 证书
certbot --nginx -d your-domain.com
```

### 第 9 步：管理 Docker 容器

常用 Docker 命令：

```bash
# 查看运行状态
docker-compose -f docker-compose-selfhost.yml ps

# 查看日志
docker-compose -f docker-compose-selfhost.yml logs -f

# 停止服务
docker-compose -f docker-compose-selfhost.yml down

# 重启服务
docker-compose -f docker-compose-selfhost.yml restart

# 更新代码并重新部署
git pull
docker-compose -f docker-compose-selfhost.yml down
docker-compose -f docker-compose-selfhost.yml up -d --build
```

### 第 10 步：验证部署

1. **直接访问测试**（如果没有配置域名）：
   ```bash
   curl http://your-vps-ip:7860/
   ```

2. **通过域名访问**（如果配置了域名）：
   ```bash
   curl https://your-domain.com/
   ```

3. **测试 API 端点**：
   ```bash
   # 测试 OpenAI 代理
   curl -X POST http://your-vps-ip:7860/proxy/openai/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your-proxy-key-here" \
     -d '{
       "model": "gpt-3.5-turbo",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

## 监控和维护

### 设置自动重启

创建 systemd 服务以确保容器在系统重启后自动启动：

```bash
vim /etc/systemd/system/oai-proxy.service
```

添加：

```ini
[Unit]
Description=OAI Reverse Proxy
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/apps/zuihouyiban-api/docker
ExecStart=/usr/local/bin/docker-compose -f docker-compose-selfhost.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose-selfhost.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
systemctl enable oai-proxy
systemctl start oai-proxy
```

### 日志管理

```bash
# 查看最近 100 行日志
docker-compose -f /opt/apps/zuihouyiban-api/docker/docker-compose-selfhost.yml logs --tail=100

# 持续查看日志
docker-compose -f /opt/apps/zuihouyiban-api/docker/docker-compose-selfhost.yml logs -f
```

### 备份配置

定期备份您的 `.env` 文件：

```bash
cp /opt/apps/zuihouyiban-api/.env /root/backup-env-$(date +%Y%m%d).env
```

## 故障排除

### 1. 端口被占用
如果端口 7860 被占用，修改 `.env` 中的 `PORT` 值和 Docker Compose 配置。

### 2. 内存不足
如果 VPS 内存较小，可以添加 swap：

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3. Docker 容器无法启动
检查日志：
```bash
docker-compose -f docker-compose-selfhost.yml logs
```

### 4. API 密钥验证失败
确保 `.env` 文件中的 API 密钥格式正确，没有额外的空格或换行符。

## 安全建议

1. **定期更新系统**：
   ```bash
   apt update && apt upgrade -y
   ```

2. **使用非 root 用户**（推荐）：
   ```bash
   adduser appuser
   usermod -aG docker appuser
   su - appuser
   ```

3. **配置 fail2ban** 防止暴力攻击：
   ```bash
   apt install -y fail2ban
   systemctl enable fail2ban
   ```

4. **定期备份**：
   - 备份 `.env` 文件
   - 备份数据目录（如果有持久化数据）

5. **监控资源使用**：
   ```bash
   # 安装 htop 监控工具
   apt install -y htop
   htop
   ```

## 支持的 API 端点

部署完成后，您的代理服务支持以下端点：

- **OpenAI**: `https://your-domain.com/proxy/openai/v1/*`
- **Anthropic**: `https://your-domain.com/proxy/anthropic/v1/*`
- **Google AI**: `https://your-domain.com/proxy/google-ai/v1/*`
- **管理界面**: `https://your-domain.com/admin` (需要 ADMIN_KEY)

## 客户端配置示例

### OpenAI Python SDK
```python
import openai

openai.api_base = "https://your-domain.com/proxy/openai/v1"
openai.api_key = "your-proxy-key-here"

response = openai.ChatCompletion.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Anthropic SDK
```python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://your-domain.com/proxy/anthropic/v1",
    api_key="your-proxy-key-here"
)
```

## 更新部署

当需要更新到最新版本时：

```bash
cd /opt/apps/zuihouyiban-api
git pull origin master
docker-compose -f docker/docker-compose-selfhost.yml down
docker-compose -f docker/docker-compose-selfhost.yml up -d --build
```

## 联系支持

如果遇到问题，请检查：
1. Docker 日志
2. `.env` 配置
3. 网络连接
4. API 密钥有效性

---

**注意**: 请妥善保管您的 API 密钥和管理员密钥，不要将它们提交到公共仓库中。
