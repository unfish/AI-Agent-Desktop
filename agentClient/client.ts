#!/usr/bin/env node

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

// 配置接口
interface Config {
  baseUrl?: string;
  apiKey?: string;
  authToken?: string;
  systemPromptType: string;
  systemPrompts: {
    [key: string]: {
      name: string;
      prompt: string;
    };
  };
}

// 全局状态
let conversationHistory: string[] = [];
let systemPrompt: string = '';
let isProcessing = false;
let startTime: number = 0;
let statusInterval: NodeJS.Timeout | null = null;

// 格式化时间显示
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化工具调用显示
function formatToolCall(toolName: string, input: any): string {
  try {
    switch (toolName) {
      case 'Bash':
        return chalk.cyan(`$ ${input.command || ''}`);
      case 'Read':
        return chalk.green(`📖 Read: ${input.file_path || ''}`);
      case 'Write':
        const filePath = input.file_path || '';
        const lines = input.content ? input.content.split('\n').length : 0;
        return chalk.yellow(`✍️  Write: ${filePath} (${lines} lines)`);
      case 'Edit':
        return chalk.magenta(`✏️  Edit: ${input.file_path || ''}`);
      case 'Grep':
        return chalk.blue(`🔍 Grep: "${input.pattern || ''}" ${input.path ? `in ${input.path}` : ''}`);
      case 'Glob':
        return chalk.blue(`📁 Glob: ${input.pattern || ''}`);
      default:
        if (input.command) return chalk.cyan(`${toolName}: ${input.command}`);
        if (input.file_path) return chalk.cyan(`${toolName}: ${input.file_path}`);
        if (input.pattern) return chalk.cyan(`${toolName}: ${input.pattern}`);
        return chalk.cyan(`🔧 ${toolName}`);
    }
  } catch (e) {
    return chalk.cyan(`🔧 ${toolName}`);
  }
}

// 加载配置
function loadConfig(): Config {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error(chalk.red('❌ 错误: 找不到 config.json 文件'));
    console.log(chalk.yellow('💡 请复制 config.example.json 为 config.json 并填写配置信息'));
    process.exit(1);
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config: Config = JSON.parse(configData);

    // 验证配置
    if (!config.apiKey && !config.authToken) {
      console.error(chalk.red('❌ 错误: 必须提供 apiKey 或 authToken'));
      process.exit(1);
    }

    if (!config.systemPrompts || !config.systemPrompts[config.systemPromptType]) {
      console.error(chalk.red(`❌ 错误: 找不到系统提示词类型 "${config.systemPromptType}"`));
      process.exit(1);
    }

    return config;
  } catch (error: any) {
    console.error(chalk.red(`❌ 错误: 无法加载配置文件: ${error.message}`));
    process.exit(1);
  }
}

// 初始化配置
function initializeConfig(config: Config) {
  const promptConfig = config.systemPrompts[config.systemPromptType];

  // 设置环境变量
  if (config.baseUrl) {
    process.env.ANTHROPIC_BASE_URL = config.baseUrl;
  }
  if (config.apiKey) {
    process.env.ANTHROPIC_API_KEY = config.apiKey;
  }
  if (config.authToken) {
    process.env.ANTHROPIC_AUTH_TOKEN = config.authToken;
  }

  // 设置系统提示词
  systemPrompt = promptConfig.prompt;
}

// 处理用户输入
async function handleUserInput(userInput: string) {
  isProcessing = true;
  startTime = Date.now();

  try {
    // 构建完整的提示词
    let fullPrompt = `${systemPrompt}\n\n`;

    // 添加对话历史
    if (conversationHistory.length > 0) {
      fullPrompt += 'Previous conversation:\n';
      fullPrompt += conversationHistory.join('\n');
      fullPrompt += '\n\n';
    }

    fullPrompt += `User: ${userInput}`;

    // 记录用户消息
    conversationHistory.push(`User: ${userInput}`);

    let assistantResponse = '';
    let lastStatusTime = Date.now();
    let hasStartedOutput = false;

    // 跟踪工具调用状态
    const toolCalls = new Map<string, { name: string; input: any; startTime: number }>();

    const result = query({
      prompt: fullPrompt,
      options: {
        permissionMode: 'acceptEdits',
        maxTurns: 50,
        allowedTools: ['Read', 'Write', 'Bash', 'Grep', 'Glob'],
        includePartialMessages: true,
      },
    });

    for await (const msg of result) {
      if (!isProcessing) {
        // 用户按了 Ctrl+C，中断处理
        break;
      }

      // 每秒更新一次状态（不干扰输出）
      const now = Date.now();
      if (now - lastStatusTime > 1000) {
        const elapsed = Math.floor((now - startTime) / 1000);
        process.title = `Claude Agent - ${formatTime(elapsed)}`;
        lastStatusTime = now;
      }

      if (msg.type === 'stream_event') {
        // 只处理流式事件（增量更新）
        const event = msg.event;

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          // 流式文本增量
          if (!hasStartedOutput) {
            process.stdout.write('\n' + chalk.cyan('AI > '));
            hasStartedOutput = true;
          }
          assistantResponse += event.delta.text;
          process.stdout.write(event.delta.text);
        }
        else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          // 工具调用开始 - 立即显示工具名称
          if (!hasStartedOutput) {
            process.stdout.write('\n' + chalk.cyan('AI > '));
            hasStartedOutput = true;
          }

          const toolId = event.content_block.id;
          const toolName = event.content_block.name;

          // 记录工具调用开始（参数稍后通过 input_json_delta 补充）
          toolCalls.set(toolId, {
            name: toolName,
            input: {},
            startTime: Date.now()
          });

          // 立即显示工具名称
          let toolNameDisplay = '';
          switch (toolName) {
            case 'Bash':
              toolNameDisplay = chalk.cyan('$');
              break;
            case 'Read':
              toolNameDisplay = chalk.green('📖 Read');
              break;
            case 'Write':
              toolNameDisplay = chalk.yellow('✍️  Write');
              break;
            case 'Edit':
              toolNameDisplay = chalk.magenta('✏️  Edit');
              break;
            case 'Grep':
              toolNameDisplay = chalk.blue('🔍 Grep');
              break;
            case 'Glob':
              toolNameDisplay = chalk.blue('📁 Glob');
              break;
            default:
              toolNameDisplay = chalk.cyan(`🔧 ${toolName}`);
          }
          process.stdout.write(`\n${chalk.dim('⏳')} ${toolNameDisplay} ${chalk.dim('...')}`);
        }
        else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          // 工具调用参数增量更新
          const blockIndex = event.index;

          // 找到对应的工具调用（通过索引）
          let targetToolId: string | null = null;
          let currentIndex = 0;
          for (const [toolId] of toolCalls) {
            if (currentIndex === blockIndex) {
              targetToolId = toolId;
              break;
            }
            currentIndex++;
          }

          if (targetToolId) {
            const currentTool = toolCalls.get(targetToolId);
            if (currentTool && event.delta.partial_json) {
              try {
                // 累积 JSON 片段
                if (!currentTool.input.__json_buffer) {
                  currentTool.input.__json_buffer = '';
                }
                currentTool.input.__json_buffer += event.delta.partial_json;

                // 尝试解析完整的 JSON
                try {
                  const parsedInput = JSON.parse(currentTool.input.__json_buffer);
                  currentTool.input = parsedInput;
                } catch (e) {
                  // JSON 还不完整，继续等待
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
        else if (event.type === 'content_block_stop') {
          // 内容块结束 - 原地更新显示完整参数
          const blockIndex = event.index;

          let targetToolId: string | null = null;
          let currentIndex = 0;
          for (const [toolId] of toolCalls) {
            if (currentIndex === blockIndex) {
              targetToolId = toolId;
              break;
            }
            currentIndex++;
          }

          if (targetToolId) {
            const toolCall = toolCalls.get(targetToolId);
            if (toolCall && !toolCall.input.__completed) {
              // 清理内部字段
              if (toolCall.input.__json_buffer) {
                delete toolCall.input.__json_buffer;
              }

              const duration = Math.floor((Date.now() - toolCall.startTime) / 1000);
              const toolDisplay = formatToolCall(toolCall.name, toolCall.input);

              // 清空当前行，然后输出完整信息并换行
              process.stdout.write('\r\x1b[K'); // \x1b[K 清除从光标到行尾的内容
              process.stdout.write(`${chalk.green('✓')} ${toolDisplay} ${chalk.green(`(${duration}s)`)}\n`);

              toolCall.input.__completed = true;
            }
          }
        }
      }
      else if (msg.type === 'tool_progress') {
        // 工具执行进度更新（如果 SDK 提供的话）
        const toolId = (msg as any).tool_use_id;
        const toolCall = toolCalls.get(toolId);

        if (toolCall && !toolCall.input.__completed) {
          const duration = Math.floor((Date.now() - toolCall.startTime) / 1000);
          const toolDisplay = formatToolCall(toolCall.name, toolCall.input);
          process.stdout.write(`\r${chalk.yellow('⚡')} ${toolDisplay} ${chalk.yellow(`(执行中... ${duration}s)`)}`);
        }
      }
      else if (msg.type === 'result') {
        // 处理完成 - 不再重复输出，只清理状态
        toolCalls.clear();
      }
    }

    // 记录助手响应
    if (assistantResponse.trim()) {
      conversationHistory.push(`Assistant: ${assistantResponse}`);
    }

    // 显示完成信息
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (isProcessing) {
      console.log('\n' + chalk.green(`✓ 完成 (${formatTime(elapsed)})`));
    } else {
      console.log('\n' + chalk.yellow(`⚠️  已中断 (${formatTime(elapsed)})`));
    }

  } catch (error: any) {
    console.error(chalk.red(`\n❌ 错误: ${error.message}`));
  } finally {
    isProcessing = false;
    process.title = 'Claude Agent';
  }
}

// 主程序
async function main() {
  console.clear();

  // 加载配置
  const config = loadConfig();
  const promptConfig = config.systemPrompts[config.systemPromptType];

  // 显示欢迎信息
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║    Claude Agent 命令行客户端             ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════╝\n'));

  console.log(chalk.green(`🤖 当前身份: ${promptConfig.name}`));
  console.log(chalk.gray(`📝 系统提示词类型: ${config.systemPromptType}`));
  console.log(chalk.gray(`🔧 允许的工具: Read, Write, Bash, Grep, Glob\n`));

  console.log(chalk.yellow('💡 提示:'));
  console.log(chalk.gray('  - 按 Ctrl+C 可以中断 AI 回复'));
  console.log(chalk.gray('  - 输入 "exit" 或 "quit" 退出程序'));
  console.log(chalk.gray('  - 执行时长显示在终端标题栏\n'));

  // 初始化配置
  console.log(chalk.blue('⏳ 正在初始化配置...'));
  try {
    initializeConfig(config);
    console.log(chalk.green('✓ 配置初始化成功\n'));
  } catch (error: any) {
    console.error(chalk.red(`❌ 初始化失败: ${error.message}`));
    process.exit(1);
  }

  // 设置 readline 接口 - 不使用 prompt 参数
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 监听 Ctrl+C 来中断 AI 处理
  process.on('SIGINT', () => {
    if (isProcessing) {
      isProcessing = false;
    } else {
      console.log(chalk.yellow('\n\n👋 再见！'));
      rl.close();
      process.exit(0);
    }
  });

  // 主循环
  const askQuestion = () => {
    rl.question(chalk.bold.green('\n你 > '), async (input) => {
      const line = input.trim();

      if (line.toLowerCase() === 'exit' || line.toLowerCase() === 'quit') {
        console.log(chalk.yellow('\n👋 再见！'));
        rl.close();
        process.exit(0);
      }

      if (line) {
        await handleUserInput(line);
      }

      // 继续下一轮
      askQuestion();
    });
  };

  // 开始交互
  askQuestion();
}

// 运行主程序
main().catch((error) => {
  console.error(chalk.red(`\n❌ 致命错误: ${error.message}`));
  process.exit(1);
});
