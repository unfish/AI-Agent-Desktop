@echo off
echo ================================
echo Claude Agent Desktop 启动脚本
echo ================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未安装 Node.js
    echo 请访问 https://nodejs.org/ 下载安装
    pause
    exit /b 1
)

echo [OK] Node.js 已安装
node --version
echo.

:: 检查依赖
if not exist "node_modules\" (
    echo 安装前端依赖...
    call npm install
)

if not exist "backend\node_modules\" (
    echo 安装后端依赖...
    cd backend
    call npm install
    cd ..
)

echo.
echo 启动后端服务...
cd backend
start /B npm run dev
cd ..

:: 等待后端启动
echo 等待后端服务启动...
timeout /t 3 /nobreak >nul

echo.
echo 启动 Tauri 应用...
call npm run tauri dev

echo.
echo 应用已关闭
pause
