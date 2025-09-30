#!/bin/bash

# oai-reverse-proxy 快速部署脚本
# 用于在 Ubuntu VPS 上快速部署项目

set -e  # 遇到错误立即退出

# 彩色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "此脚本必须以 root 权限运行"
        exit 1
    fi
}

# 更新系统
update_system() {
    print_message "正在更新系统包..."
    apt update && apt upgrade -y
    apt install -y curl git vim wget
}

# 安装 Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_message "Docker 已安装，跳过..."
    else
        print_message "正在安装 Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
    fi
}

# 安装 Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        print_message "Docker Compose 已安装，跳过..."
    else
        print_message "正在安装 Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi
}

# 克隆项目
clone_project() {
    print_message "正在克隆项目..."
    mkdir -p /opt/apps
    cd /opt/apps
    
    if [ -d "zuihouyiban-api" ]; then
        print_warning "项目目录已存在，正在更新..."
        cd zuihouyiban-api
        git pull origin master
    else
        git clone https://github.com/ojinnnn/zuihouyiban-api.git
        cd zuihouyiban-api
    fi
}

# 创建环境变量文件
create_env_file() {
    if [ -f ".env" ]; then
        print_warning ".env 文件已存在"
        read -p "是否要重新配置 .env 文件？(y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    print_message "配置环境变量..."
    
    # 收集必要的信息
    read -p "请输入 OpenAI API 密钥 (sk-...): " OPENAI_KEY
    read -p "请输入 Anthropic API 密钥 (sk-ant-...): " ANTHROPIC_KEY
    read -p "请输入 Google AI API 密钥: " GOOGLE_AI_KEY
    read -p "请输入管理员密钥 (用于访问管理界面): " ADMIN_KEY
    read -p "请输入代理访问密钥 (用于客户端认证): " PROXY_KEY
    read -p "请输入服务端口 (默认 7860): " PORT
    PORT=${PORT:-7860}
    
    # 创建 .env 文件
    cat > .env << EOF
# 服务器配置
PORT=${PORT}
LOG_LEVEL=info

# 管理员配置
ADMIN_KEY=${ADMIN_KEY}

# OpenAI API 密钥
OPENAI_KEY=${OPENAI_KEY}

# Anthropic API 密钥  
ANTHROPIC_KEY=${ANTHROPIC_KEY}

# Google AI API 密钥
GOOGLE_AI_KEY=${GOOGLE_AI_KEY}

# 其他配置
PROXY_KEY=${PROXY_KEY}
GATEKEEPER=proxy_key
ALLOWED_MODEL_FAMILIES=claude,gpt,gemini
EOF
    
    print_message ".env 文件已创建"
}

# 启动 Docker 容器
start_docker() {
    print_message "正在启动 Docker 容器..."
    cd /opt/apps/zuihouyiban-api/docker
    docker-compose -f docker-compose-selfhost.yml down 2>/dev/null || true
    docker-compose -f docker-compose-selfhost.yml up -d --build
}

# 配置防火墙
setup_firewall() {
    print_message "配置防火墙..."
    
    # 安装 ufw
    apt install -y ufw
    
    # 配置规则
    ufw allow 22/tcp
    ufw allow ${PORT:-7860}/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # 启用防火墙
    ufw --force enable
    
    print_message "防火墙已配置"
}

# 创建 systemd 服务
create_systemd_service() {
    print_message "创建系统服务..."
    
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
    
    print_message "系统服务已创建"
}

# 显示状态
show_status() {
    print_message "检查服务状态..."
    cd /opt/apps/zuihouyiban-api/docker
    docker-compose -f docker-compose-selfhost.yml ps
}

# 显示访问信息
show_access_info() {
    # 获取服务器 IP
    SERVER_IP=$(curl -s ifconfig.me)
    PORT=${PORT:-7860}
    
    echo
    echo "=========================================="
    echo -e "${GREEN}部署成功！${NC}"
    echo "=========================================="
    echo
    echo "访问信息："
    echo "-----------------------------------------"
    echo "服务地址: http://${SERVER_IP}:${PORT}"
    echo "管理界面: http://${SERVER_IP}:${PORT}/admin"
    echo
    echo "API 端点："
    echo "  OpenAI:    http://${SERVER_IP}:${PORT}/proxy/openai/v1"
    echo "  Anthropic: http://${SERVER_IP}:${PORT}/proxy/anthropic/v1"
    echo "  Google AI: http://${SERVER_IP}:${PORT}/proxy/google-ai/v1"
    echo
    echo "使用您配置的 PROXY_KEY 作为 API 密钥"
    echo "使用您配置的 ADMIN_KEY 访问管理界面"
    echo
    echo "常用命令："
    echo "  查看日志: docker-compose -f /opt/apps/zuihouyiban-api/docker/docker-compose-selfhost.yml logs -f"
    echo "  重启服务: systemctl restart oai-proxy"
    echo "  停止服务: systemctl stop oai-proxy"
    echo
    echo "=========================================="
}

# 主函数
main() {
    print_message "开始部署 oai-reverse-proxy..."
    
    check_root
    update_system
    install_docker
    install_docker_compose
    clone_project
    create_env_file
    start_docker
    setup_firewall
    create_systemd_service
    
    # 等待服务启动
    print_message "等待服务启动..."
    sleep 5
    
    show_status
    show_access_info
    
    print_message "部署完成！"
}

# 运行主函数
main
