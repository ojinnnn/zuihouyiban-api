# 加密货币挖矿验证集成完成

## 🎉 集成状态：成功完成

webcryptomining 项目已成功集成到 oai-reverse-proxy 中，用于替代原有的 pow-captcha 系统。

## 🚀 如何使用

### 1. 启动服务器
服务器已经成功启动并运行在：
```
http://localhost:7860
```

### 2. 访问挖矿验证界面
用户可以通过以下 URL 访问挖矿验证：
```
http://localhost:7860/user/mining
```

### 3. 获取用户令牌流程
1. 访问挖矿界面
2. 点击 "Get a new token" 按钮
3. 系统会加载挖矿界面（iframe 嵌入 WebRandomX）
4. 完成指定数量的挖矿哈希（当前设置：200 个哈希，难度级别：low）
5. 验证完成后获得 24 小时有效的用户令牌

## 📋 当前配置

- **验证模式**: `crypto_mining`
- **挖矿服务器**: `http://107.174.140.107:9999`
- **难度级别**: `low` (200 个哈希)
- **令牌有效期**: 24 小时
- **最大 IP 数**: 2 个
- **挑战超时**: 30 分钟

## 🔧 配置文件

当前 `.env` 配置：
```env
GATEKEEPER=user_token
CAPTCHA_MODE=crypto_mining
MINING_SERVER_URL=http://107.174.140.107:9999
POW_DIFFICULTY_LEVEL=low
POW_TOKEN_HOURS=24
POW_TOKEN_MAX_IPS=2
POW_CHALLENGE_TIMEOUT=30
```

## ✅ 已验证功能

- [x] 服务器成功启动
- [x] 挖矿界面正常加载
- [x] API 端点正常响应
- [x] CSRF 保护正常工作
- [x] 用户界面完整显示
- [x] 挖矿组件正确集成

## 🔄 与原系统的区别

| 功能 | 原 pow-captcha | 新 crypto-mining |
|------|----------------|------------------|
| 验证方式 | Argon2 哈希计算 | 真实加密货币挖矿 |
| 访问路径 | `/user/captcha` | `/user/mining` |
| 计算工作 | 纯工作量证明 | 有经济价值的挖矿 |
| 用户体验 | 本地计算 | iframe 嵌入挖矿界面 |

## 🎯 优势

1. **真实价值**: 用户的计算工作产生实际的加密货币收益
2. **更强防护**: 攻击者需要付出更高的经济成本
3. **灵活配置**: 可根据需要调整难度和挖矿服务器
4. **向后兼容**: 保持与现有系统的完全兼容性

## 🛠️ 故障排除

### 如果挖矿界面无法加载
1. 检查 `MINING_SERVER_URL` 配置
2. 确认挖矿服务器 `http://107.174.140.107:9999` 可访问
3. 检查网络防火墙设置

### 如果令牌验证失败
1. 确保完成了足够数量的哈希
2. 检查挑战是否在超时时间内完成
3. 查看服务器日志获取详细错误信息

## 📚 相关文档

- 详细配置说明：`docs/crypto-mining.md`
- 示例配置文件：`.env.crypto-mining-example`
- WebRandomX 项目：https://github.com/WebCryptomining/WebRandomX

## 🎊 集成完成

恭喜！webcryptomining 项目已成功集成到您的 oai-reverse-proxy 中。现在用户可以通过真实的加密货币挖矿来获取访问令牌，这提供了比传统工作量证明更强的安全保护和实际的经济价值。
