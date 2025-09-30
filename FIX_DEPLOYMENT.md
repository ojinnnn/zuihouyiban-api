# 🔧 Docker 构建错误修复指南

您遇到的错误是因为原始的 Dockerfile 使用了 Docker secrets，这在本地构建时不可用。我已经为您创建了适合本地部署的新配置文件。

## 📝 快速修复步骤

在您的 VPS 服务器上执行以下命令：

### 1. 更新代码（获取新的配置文件）

```bash
cd /opt/apps/zuihouyiban-api
git pull origin master
```

### 2. 停止当前容器（如果有）

```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-selfhost.yml down 2>/dev/null || true
```

### 3. 使用新的本地部署配置

```bash
# 确保在 docker 目录
cd /opt/apps/zuihouyiban-api/docker

# 使用新的 docker-compose-local.yml 文件构建和启动
docker-compose -f docker-compose-local.yml up -d --build
```

## ✅ 验证部署

### 检查容器状态

```bash
docker-compose -f docker-compose-local.yml ps
```

应该看到类似输出：
```
NAME                          COMMAND                  SERVICE               STATUS              PORTS
docker_oai-reverse-proxy_1   "docker-entrypoint.s…"   oai-reverse-proxy    Up                  0.0.0.0:7861->7861/tcp
```

### 查看日志

```bash
docker-compose -f docker-compose-local.yml logs --tail=50
```

### 测试服务

```bash
# 测试本地访问
curl http://localhost:7861/

# 测试 API
curl -X POST http://localhost:7861/proxy/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-PROXY-KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 📋 新配置文件说明

我创建了两个新文件来解决构建问题：

1. **`docker/Dockerfile.local`** - 简化的 Dockerfile，不使用 Docker secrets
2. **`docker/docker-compose-local.yml`** - 使用新 Dockerfile 的 compose 配置

### 主要改动：

- 移除了 Docker secrets 的依赖
- 直接从 `.env` 文件读取环境变量
- 简化了构建流程
- 保持端口 7861 配置

## 🔄 后续维护命令

使用新的配置文件后，维护命令需要相应更新：

### 查看状态
```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-local.yml ps
```

### 重启服务
```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-local.yml restart
```

### 停止服务
```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-local.yml down
```

### 查看日志
```bash
cd /opt/apps/zuihouyiban-api/docker
docker-compose -f docker-compose-local.yml logs -f
```

### 更新并重新部署
```bash
cd /opt/apps/zuihouyiban-api
git pull origin master
cd docker
docker-compose -f docker-compose-local.yml down
docker-compose -f docker-compose-local.yml up -d --build
```

## 💡 如果还有问题

### 1. 清理 Docker 缓存
```bash
docker system prune -a
```

### 2. 检查 .env 文件
确保 .env 文件存在且格式正确：
```bash
cat /opt/apps/zuihouyiban-api/.env
```

### 3. 手动构建测试
```bash
cd /opt/apps/zuihouyiban-api
docker build -f docker/Dockerfile.local -t test-build .
```

### 4. 查看详细错误
```bash
docker-compose -f docker-compose-local.yml up --build
# 不加 -d，可以看到实时输出
```

## 🎯 预期结果

成功部署后：
- 服务运行在端口 7861
- 可以访问 `http://YOUR-VPS-IP:7861/`
- API 端点正常响应
- 容器自动重启（如果崩溃）

---

**注意**: 请使用 `docker-compose-local.yml` 而不是 `docker-compose-selfhost.yml` 来避免构建错误。
