# Claude Agent 命令行客户端

一个基于 Claude Agent SDK 的交互式命令行客户端，提供类似 Claude Code 的使用体验。

## 功能特性

- 🎯 **交互式对话**: 在命令行中与 AI 进行自然对话
- 🔄 **流式输出**: 实时显示 AI 的思考和回复过程
- 🛠️ **工具调用**: 支持文件读写、命令执行、代码搜索等操作
- ⏱️ **执行计时**: 实时显示对话执行时长
- ⚡ **中断控制**: 按 ESC 可随时中断 AI 回复
- 🎨 **彩色输出**: 美观的命令行界面，不同类型内容用不同颜色区分

## 快速开始

### 1. 安装依赖

```bash
cd agentClient
npm install
```

### 2. 配置

复制示例配置文件并填写你的 API 信息：

```bash
cp config.example.json config.json
```

编辑 `config.json`，填写以下信息：

```json
{
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "sk-ant-...",  // 你的 Anthropic API Key
  "authToken": "",          // 或者使用 Auth Token
  "systemPromptType": "general"  // 选择 AI 角色类型
}
```

**可用的系统提示词类型：**

- `general` - 通用助手
- `data_analyst` - 数据分析专家
- `content_writer` - 文案专家
- `researcher` - 深度调研专家

### 3. 运行

**推荐方式（编译后运行）：**

```bash
npm run build
npm start
```

**或直接运行（不编译，适合测试）：**

```bash
npm run dev
```

> 注意：开发模式(`npm run dev`)使用 `tsx` 直接运行 TypeScript，不会热重载，避免输入干扰。

## 使用说明

### 启动后

程序会显示当前 AI 的身份和配置信息，然后进入等待输入状态：

```
╔════════════════════════════════════════════╗
║    Claude Agent 命令行客户端             ║
╚════════════════════════════════════════════╝

🤖 当前身份: 通用助手
📝 系统提示词类型: general
🔧 允许的工具: Read, Write, Bash, Grep, Glob

💡 提示:
  - 按 Ctrl+C 可以中断 AI 回复
  - 输入 "exit" 或 "quit" 退出程序

✓ Agent 初始化成功

你 >
```

### 交互操作

1. **输入问题**: 直接输入你的问题或指令，按回车发送
2. **查看回复**: AI 会以流式方式输出文本和工具调用
3. **中断回复**: 在 AI 回复过程中按 `Ctrl+C` 可中断
4. **退出程序**: 输入 `exit` 或 `quit`，或在空闲时按 `Ctrl+C`

### 工具调用显示

当 AI 调用工具时，会以彩色格式显示：

- 📖 **Read**: 绿色显示，格式 `📖 Read: 文件路径`
- ✍️ **Write**: 黄色显示，格式 `✍️ Write: 文件路径 (行数)`
- ✏️ **Edit**: 紫色显示，格式 `✏️ Edit: 文件路径`
- $ **Bash**: 青色显示，格式 `$ 命令`
- 🔍 **Grep**: 蓝色显示，格式 `🔍 Grep: "模式" in 路径`
- 📁 **Glob**: 蓝色显示，格式 `📁 Glob: 模式`

### 示例对话

```
你 > 帮我创建一个 Python 脚本来计算斐波那契数列

AI >
我来帮你创建一个计算斐波那契数列的 Python 脚本。

✍️ Write: fibonacci.py (15 lines)

我已经创建了一个 fibonacci.py 文件，包含以下功能：
1. 递归方法计算斐波那契数
2. 优化的迭代方法
3. 生成器方法
...

⏱ 00:03 ✓ 完成

你 >
```

## 配置说明

### API 认证

- `apiKey` 或 `authToken` 至少填写一项
- `baseUrl` 默认为 `https://api.anthropic.com`，兼容其他提供 Claude Code 接口的平台

### 系统提示词

你可以在 `config.json` 中自定义系统提示词：

```json
{
  "systemPrompts": {
    "custom": {
      "name": "自定义助手",
      "prompt": "你的自定义系统提示词..."
    }
  },
  "systemPromptType": "custom"
}
```

## 技术栈

- **Claude Agent SDK**: 官方 AI Agent 开发框架
- **TypeScript**: 类型安全的开发体验
- **chalk**: 彩色终端输出
- **ora**: 优雅的加载动画和状态显示
- **readline**: Node.js 内置的命令行交互模块

## 常见问题

### 1. 无法连接到 API

- 检查 `config.json` 中的 `baseUrl` 是否正确
- 验证 `apiKey` 或 `authToken` 是否有效
- 确认网络连接正常

### 2. 中断功能

- 在 AI 处理时按 `Ctrl+C` 可中断当前操作
- 在空闲时按 `Ctrl+C` 会退出程序

### 3. 工具调用权限错误

- 确保在正确的目录下运行客户端
- 检查文件系统权限

## 开发

### 项目结构

```
agentClient/
├── client.ts           # 主程序
├── config.json         # 配置文件（需自行创建）
├── config.example.json # 配置示例
├── package.json        # 依赖配置
├── tsconfig.json       # TypeScript 配置
└── README.md          # 说明文档
```

### 调试

使用开发模式可以获得实时重载：

```bash
npm run dev
```

修改 `client.ts` 后会自动重启程序。

## 许可证

MIT License
