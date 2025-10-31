#!/bin/bash

# Claude Agent Desktop 启动脚本

echo "🚀 Claude Agent Desktop 启动脚本"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js"
    echo "请访问 https://nodejs.org/ 下载安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装前端依赖..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend && npm install && cd ..
fi

echo ""
echo "启动后端服务..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# 等待后端启动
echo "等待后端服务启动..."
sleep 3

echo ""
echo "启动 Tauri 应用..."
npm run tauri dev

# 清理
echo ""
echo "关闭后端服务..."
kill $BACKEND_PID 2>/dev/null

echo "✅ 应用已关闭"
