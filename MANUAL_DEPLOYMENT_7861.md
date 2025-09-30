# 手动部署指南 - 端口 7861

本指南将指导您一步一步在 VPS 上使用 Docker Compose 在端口 7861 上部署 oai-reverse-proxy。

## 📋 前置准备

- Ubuntu 20.04 或更高版本的 VPS
- Root 访问权限或 sudo 权限
- 至少 1GB RAM

## 🚀 部署步骤

### 步骤 1：连接到您的 VPS

```bash
ssh root@您的VPS-IP地址
```

### 步骤 2：更新系统并安装基础工具

```bash
# 更新包列表
apt update

# 升级已安装的包
apt upgrade -y

# 安装必要的工具
apt install -y curl git vim wget
```

### 步骤 3：安装 Docker

```bash
# 下载 Docker 安装脚本
curl -fsSL https://get.docker.com -o get-docker.sh

# 运行安装脚本
sh get-docker.sh

# 删除安装脚本
rm get-docker.sh

# 验证 Docker 是否安装成功
docker --version
```

预期输出示例：`Docker version 24.0.7, build afdd53b`

### 步骤 4：安装 Docker Compose

```bash
# 下载 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 添加执行权限
chmod +x /usr/local/bin/docker-compose

# 验证安装
docker-compose --version
```

预期输出示例：`Docker Compose version v2.23.0`

### 步骤 5：创建项目目录并克隆代码

```bash
# 创建应用目录
mkdir -p /opt/apps
cd /opt/apps

# 克隆您的项目
git clone https://github.com/ojinnnn/zuihouyiban-api.git

# 进入项目目录
cd zuihouyiban-api
```

### 步骤 6：创建 .env 配置文件

```bash
# 使用 vim 创建 .env 文件
vim .env
```

按 `i` 进入插入模式，然后粘贴以下内容：

**⚠️ 重要：请替换为您的实际 API 密钥**

```env
# 服务器配置 - 使用端口 7861
PORT=7861
LOG_LEVEL=info

# 管理员配置
ADMIN_KEY=your-admin-password-here

# OpenAI API 密钥
OPENAI_KEY=sk-your-openai-key-here

# Anthropic API 密钥  
ANTHROPIC_KEY=sk-ant-your-anthropic-key-here

# Google AI API 密钥
GOOGLE_AI_KEY=your-google-ai-key-here

# 代理访问密钥（客户端需要使用这个密钥）
PROXY_KEY=your-proxy-access-key-here

# 网关守护配置
GATEKEEPER=proxy_key
ALLOWED_MODEL_FAMILIES=claude,gpt,gemini
```

保存文件：
1. 按 `ESC` 退出插入模式
2. 输入 `:wq` 并按回车保存退出

### 步骤 7：修改 Docker Compose 配置文件

首先，查看原始配置：

```bash
cat docker/docker-compose-selfhost.yml
```

然后编辑文件以使用端口 7861：

```bash
vim docker/docker-compose-selfhost.yml
```

找到 `ports:` 部分，修改为：

```yaml
    ports:
      - "7861:7861"  # 修改为 7861
```

完整的文件应该类似：

```yaml
version: "3.8"
services:
  oai-reverse-proxy:
    build:
      context: ..
      dockerfile: docker/render/Dockerfile
    ports:
      - "7861:7861"  # 这里改为 7861
    env_file:
      - ../.env
    restart: unless-stopped
    volumes:
      - ../data:/app/data
```

保存并退出（`ESC` → `:wq`）

### 步骤 8：启动 Docker 容器

```bash
# 进入 docker 目录
cd /opt/apps/zuihouyiban-api/docker

# 首次启动（会构建镜像，需要几分钟）
docker-compose -f docker-compose-selfhost.yml up -d --build
```

您会看到类似输出：
```
Creating network "docker_default" with the default driver
Building oai-reverse-proxy
...
Creating docker_oai-reverse-proxy_1 ... done
```

### 步骤 9：检查服务状态

```bash
# 查看容器运行状态
docker-compose -f docker-compose-selfhost.yml ps
```

应该看到状态为 "Up"：
```
NAME                          COMMAND                  SERVICE               STATUS              PORTS
docker_oai-reverse-proxy_1   "docker-entrypoint.s…"   oai-reverse-proxy    Up                  0.0.0.0:7861->7861/tcp
```

查看实时日志：
```bash
# 查看最近的日志
docker-compose -f docker-compose-selfhost.yml logs --tail=50

# 持续查看日志（按 Ctrl+C 退出）
docker-compose -f docker-compose-selfhost.yml logs -f
```

### 步骤 10：配置防火墙

如果您的服务器使用 ufw：

```bash
# 安装 ufw（如果未安装）
apt install -y ufw

# 允许 SSH（重要！先允许 SSH）
ufw allow 22/tcp

# 允许端口 7861
ufw allow 7861/tcp

# 启用防火墙
ufw --force enable

# 查看状态
ufw status
```

如果使用 iptables：

```bash
iptables -A INPUT -p tcp --dport 7861 -j ACCEPT
iptables-save > /etc/iptables/rules.v4
```

### 步骤 11：验证服务运行

在服务器上测试：

```bash
# 测试本地访问
curl http://localhost:7861/

# 获取您的服务器公网 IP
curl ifconfig.me
echo  # 换行
```

记下显示的 IP 地址。

### 步骤 12：测试 API 访问

从您的本地电脑测试（替换 YOUR-VPS-IP 和 YOUR-PROXY-KEY）：

```bash
# 测试主页
curl http://YOUR-VPS-IP:7861/

# 测试 OpenAI API 端点
curl -X POST http://YOUR-VPS-IP:7861/proxy/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-PROXY-KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

## 🔧 常用管理命令

### 查看状态和日志

```bash
cd /opt/apps/zuihouyiban-api/docker

# 查看容器状态
docker-compose -f docker-compose-selfhost.yml ps

# 查看实时日志
docker-compose -f docker-compose-selfhost.yml logs -f

# 查看最近 100 行日志
docker-compose -f docker-compose-selfhost.yml logs --tail=100
```

### 重启服务

```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-selfhost.yml restart
```

### 停止服务

```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-selfhost.yml down
```

### 启动服务

```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-selfhost.yml up -d
```

### 更新代码并重新部署

```bash
cd /opt/apps/zuihouyiban-api

# 拉取最新代码
git pull origin master

# 重新构建并启动
cd docker
docker-compose -f docker-compose-selfhost.yml down
docker-compose -f docker-compose-selfhost.yml up -d --build
```

## 📡 访问地址

部署成功后，您可以通过以下地址访问：

- **服务主页**: `http://YOUR-VPS-IP:7861/`
- **管理界面**: `http://YOUR-VPS-IP:7861/admin`
  - 使用您在 .env 中设置的 ADMIN_KEY 登录
- **API 端点**:
  - OpenAI: `http://YOUR-VPS-IP:7861/proxy/openai/v1/`
  - Anthropic: `http://YOUR-VPS-IP:7861/proxy/anthropic/v1/`
  - Google AI: `http://YOUR-VPS-IP:7861/proxy/google-ai/v1/`

## 🔍 故障排除

### 1. 端口被占用

检查端口是否被占用：

```bash
netstat -tulpn | grep 7861
# 或
lsof -i :7861
```

如果被占用，找到并停止占用的进程，或修改 .env 和 docker-compose 文件使用其他端口。

### 2. 容器无法启动

查看详细错误：

```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-selfhost.yml logs
```

常见问题：
- .env 文件格式错误
- API 密钥格式不正确
- 内存不足

### 3. 无法访问服务

检查：

```bash
# 检查容器是否运行
docker ps | grep oai-reverse-proxy

# 检查防火墙
ufw status

# 测试本地访问
curl http://localhost:7861/
```

### 4. API 调用失败

确保：
- 使用正确的 PROXY_KEY
- API 密钥有效且格式正确
- 检查日志查看具体错误

```bash
docker-compose -f docker-compose-selfhost.yml logs --tail=100
```

## 💡 优化建议

### 设置自动重启

创建 systemd 服务：

```bash
cat > /etc/systemd/system/oai-proxy.service << EOF
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
EOF

systemctl daemon-reload
systemctl enable oai-proxy
```

### 监控内存使用

```bash
# 查看容器资源使用
docker stats

# 安装 htop 监控
apt install -y htop
htop
```

### 定期备份

```bash
# 备份 .env 文件
cp /opt/apps/zuihouyiban-api/.env ~/env-backup-$(date +%Y%m%d).env

# 备份数据目录（如果有）
tar -czf ~/data-backup-$(date +%Y%m%d).tar.gz /opt/apps/zuihouyiban-api/data/
```

## ✅ 部署检查清单

- [ ] Docker 和 Docker Compose 已安装
- [ ] 项目代码已克隆
- [ ] .env 文件已创建并配置 API 密钥
- [ ] docker-compose-selfhost.yml 已修改为使用端口 7861
- [ ] Docker 容器正在运行
- [ ] 防火墙已配置允许端口 7861
- [ ] 可以通过 http://YOUR-VPS-IP:7861/ 访问服务
- [ ] API 调用测试成功

---

**提示**: 如果遇到任何问题，请查看容器日志获取详细错误信息。
