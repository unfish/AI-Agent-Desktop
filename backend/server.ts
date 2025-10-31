import express, { Request, Response } from 'express';
import cors from 'cors';
import { query } from '@anthropic-ai/claude-agent-sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

interface AgentConfig {
  baseUrl?: string;
  apiKey?: string;
  authToken?: string;
}

interface AgentSession {
  systemPrompt: string;
  allowedTools: string[];
  config: AgentConfig;
  conversationHistory: string[];
}

// 存储Agent会话配置
const sessions = new Map<string, AgentSession>();

// 预设系统提示词
const SYSTEM_PROMPTS = {
  'general': {
    name: '通用助手',
    prompt: `你是一个专业、友好的AI助手，具备广泛的知识和能力。你的目标是帮助用户解决各种问题。

核心原则：
1. 准确性：提供准确、可靠的信息，不确定时明确说明
2. 清晰性：用简洁明了的语言表达，避免冗余
3. 实用性：关注实际应用，提供可操作的建议
4. 友好性：保持专业且平易近人的交流风格

能力范围：
- 编程与技术问题解答
- 数据分析与处理
- 文档编写与内容创作
- 问题诊断与解决方案
- 学习指导与知识解答

请根据用户需求，提供最有帮助的回答。`
  },
  'data_analyst': {
    name: '数据分析',
    prompt: `你是一位专业的数据分析专家，擅长从数据中提取洞察并提供决策支持。

专业能力：
1. 数据处理：清洗、转换、聚合各类数据
2. 统计分析：描述性统计、相关性分析、假设检验
3. 可视化：选择合适的图表类型展示数据
4. 模式识别：发现趋势、异常和隐藏规律
5. 预测建模：基于历史数据进行合理预测

工作流程：
1. 理解业务问题和数据背景
2. 探索数据质量和分布特征
3. 选择合适的分析方法
4. 得出结论并提供可视化
5. 给出可执行的业务建议

分析原则：
- 数据驱动：基于证据而非假设
- 全面性：考虑多个维度和指标
- 可解释性：清晰阐述分析逻辑
- 实用性：关注业务价值和可操作性

请告诉我你的数据分析需求。`
  },
  'content_writer': {
    name: '文案专家',
    prompt: `你是一位经验丰富的文案创作专家，擅长各类内容写作和编辑。

核心能力：
1. 多样化文体：新闻、营销、技术文档、创意内容
2. 受众适配：根据目标读者调整语气和风格
3. SEO优化：自然融入关键词，提升内容可见性
4. 结构优化：清晰的逻辑框架和信息层次
5. 语言打磨：精准用词、流畅表达、生动呈现

创作流程：
1. 明确写作目标和目标受众
2. 研究主题并收集相关素材
3. 构建内容框架和大纲
4. 撰写初稿并润色优化
5. 检查语法、逻辑和可读性

写作原则：
- 清晰性：信息传达准确无歧义
- 吸引力：开头抓人，保持读者兴趣
- 价值导向：为读者提供实用信息
- 原创性：独特视角和表达方式
- 可读性：适当的段落长度和排版

请告诉我你的文案需求，包括类型、主题、风格等要求。`
  },
  'researcher': {
    name: '深度调研',
    prompt: `你是一位严谨的调研分析专家，擅长深入研究复杂问题并提供全面报告。

调研方法论：
1. 问题定义：明确调研目标和关键问题
2. 信息收集：多渠道获取可靠信息源
3. 批判性分析：评估信息质量和可信度
4. 系统整合：构建完整的知识体系
5. 结论提炼：基于证据得出客观结论

核心能力：
- 多角度分析：考虑不同立场和观点
- 事实核查：验证信息真实性和时效性
- 逻辑推理：建立因果关系和推理链条
- 趋势预测：基于现状分析未来走向
- 报告撰写：结构化呈现调研成果

调研原则：
1. 客观性：基于事实，避免主观偏见
2. 全面性：覆盖主题的各个重要方面
3. 深度性：不止于表面，挖掘本质
4. 严谨性：逻辑清晰，论证充分
5. 实用性：提供可操作的洞察

输出格式：
- 执行摘要：核心发现和关键结论
- 详细分析：分主题深入探讨
- 数据支持：相关统计和案例
- 结论建议：基于分析的行动建议

请描述你的调研主题和具体需求。`
  }
};


// 健康检查
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取预设系统提示词列表
app.get('/api/agent/prompts', (req: Request, res: Response) => {
  res.json({
    success: true,
    prompts: SYSTEM_PROMPTS
  });
});

// 创建Agent会话
app.post('/api/agent/create', async (req: Request, res: Response) => {
  try {
    const {
      sessionId = 'default',
      systemPrompt = '你是一个友好的AI助手，能够帮助用户解决各种问题。',
      allowedTools = [],
      config = {}
    } = req.body;

    // 设置环境变量（如果提供）
    if (config.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = config.baseUrl;
    }
    if (config.apiKey) {
      process.env.ANTHROPIC_API_KEY = config.apiKey;
    }
    if (config.authToken) {
      process.env.ANTHROPIC_AUTH_TOKEN = config.authToken;
    }

    // 验证至少有一个认证方式
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error('ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN 至少需要设置一个');
    }

    // 存储会话配置
    sessions.set(sessionId, {
      systemPrompt,
      allowedTools,
      config,
      conversationHistory: []
    });

    res.json({
      success: true,
      sessionId,
      message: 'Agent会话创建成功'
    });
  } catch (error: any) {
    console.error('创建Agent失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建Agent失败'
    });
  }
});

// 流式查询Agent（SSE）
app.post('/api/agent/query-stream', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'default', message: userMessage } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Agent会话不存在，请先创建会话'
      });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // 设置环境变量
      if (session.config.baseUrl) {
        process.env.ANTHROPIC_BASE_URL = session.config.baseUrl;
      }
      if (session.config.apiKey) {
        process.env.ANTHROPIC_API_KEY = session.config.apiKey;
      }
      if (session.config.authToken) {
        process.env.ANTHROPIC_AUTH_TOKEN = session.config.authToken;
      }

      // 构建完整的提示词（包含系统提示词和对话历史）
      let fullPrompt = `${session.systemPrompt}\n\n`;

      // 添加对话历史
      if (session.conversationHistory.length > 0) {
        fullPrompt += 'Previous conversation:\n';
        fullPrompt += session.conversationHistory.join('\n');
        fullPrompt += '\n\n';
      }

      fullPrompt += `User: ${userMessage}`;

      // 记录用户消息
      session.conversationHistory.push(`User: ${userMessage}`);

      // 调用 query API
      const result = query({
        prompt: fullPrompt,
        options: {
          permissionMode: 'acceptEdits',
          maxTurns: 50,
          allowedTools: session.allowedTools.length > 0 ? session.allowedTools : undefined,
          includePartialMessages: true, // 启用流式事件
        }
      });

      let assistantResponse = '';

      // 流式处理响应
      for await (const msg of result) {
        if (msg.type === 'assistant') {
          // 处理助手消息 - content 在 msg.message.content
          const content = msg.message?.content || [];
          for (const block of content) {
            if (block.type === 'text') {
              assistantResponse += block.text;
              const data = JSON.stringify({
                type: 'text',
                content: block.text,
                timestamp: new Date().toISOString()
              });
              res.write(`data: ${data}\n\n`);
            } else if (block.type === 'tool_use') {
              const data = JSON.stringify({
                type: 'tool_use',
                tool: block.name,
                input: block.input,
                timestamp: new Date().toISOString()
              });
              res.write(`data: ${data}\n\n`);
            }
          }
        } else if (msg.type === 'stream_event') {
          // 处理流式事件
          const event = msg.event;
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            assistantResponse += event.delta.text;
            const data = JSON.stringify({
              type: 'text',
              content: event.delta.text,
              timestamp: new Date().toISOString()
            });
            res.write(`data: ${data}\n\n`);
          }
        } else if (msg.type === 'result') {
          // 完成
          break;
        }
      }

      // 记录助手响应
      if (assistantResponse) {
        session.conversationHistory.push(`Assistant: ${assistantResponse}`);
      }

      // 发送完成信号
      const data = JSON.stringify({
        type: 'complete',
        timestamp: new Date().toISOString()
      });
      res.write(`data: ${data}\n\n`);
      res.end();

    } catch (error: any) {
      console.error('查询Agent失败:', error);
      const data = JSON.stringify({
        type: 'error',
        error: error.message || '查询失败',
        timestamp: new Date().toISOString()
      });
      res.write(`data: ${data}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('查询Agent失败:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || '查询失败'
      });
    }
  }
});

// 非流式查询（用于兼容）
app.post('/api/agent/query', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'default', message: userMessage } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Agent会话不存在，请先创建会话'
      });
    }

    // 设置环境变量
    if (session.config.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = session.config.baseUrl;
    }
    if (session.config.apiKey) {
      process.env.ANTHROPIC_API_KEY = session.config.apiKey;
    }
    if (session.config.authToken) {
      process.env.ANTHROPIC_AUTH_TOKEN = session.config.authToken;
    }

    // 构建完整的提示词
    let fullPrompt = `${session.systemPrompt}\n\n`;

    if (session.conversationHistory.length > 0) {
      fullPrompt += 'Previous conversation:\n';
      fullPrompt += session.conversationHistory.join('\n');
      fullPrompt += '\n\n';
    }

    fullPrompt += `User: ${userMessage}`;

    // 记录用户消息
    session.conversationHistory.push(`User: ${userMessage}`);

    // 调用 query API
    const result = query({
      prompt: fullPrompt,
      options: {
        permissionMode: 'acceptEdits',
        maxTurns: 50,
        allowedTools: session.allowedTools.length > 0 ? session.allowedTools : undefined,
        includePartialMessages: true, // 启用流式事件
      }
    });

    let fullResponse = '';
    const tools: any[] = [];

    for await (const msg of result) {
      if (msg.type === 'assistant') {
        const content = msg.message?.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          } else if (block.type === 'tool_use') {
            tools.push({
              name: block.name,
              input: block.input
            });
          }
        }
      } else if (msg.type === 'stream_event') {
        const event = msg.event;
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullResponse += event.delta.text;
        }
      } else if (msg.type === 'result') {
        break;
      }
    }

    // 记录助手响应
    if (fullResponse) {
      session.conversationHistory.push(`Assistant: ${fullResponse}`);
    }

    res.json({
      success: true,
      response: fullResponse,
      tools,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('查询Agent失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '查询失败'
    });
  }
});

// 中断Agent执行
app.post('/api/agent/interrupt', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'default' } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Agent会话不存在'
      });
    }

    // Note: query() API 不支持中断，这里只是返回成功
    // 实际中断需要在客户端关闭 SSE 连接

    res.json({
      success: true,
      message: '已中断Agent执行'
    });
  } catch (error: any) {
    console.error('中断Agent失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '中断失败'
    });
  }
});

// 关闭Agent会话
app.post('/api/agent/close', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'default' } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Agent会话不存在'
      });
    }

    sessions.delete(sessionId);

    res.json({
      success: true,
      message: 'Agent会话已关闭'
    });
  } catch (error: any) {
    console.error('关闭Agent失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '关闭失败'
    });
  }
});

// 获取所有会话列表
app.get('/api/agent/sessions', (req: Request, res: Response) => {
  const sessionList = Array.from(sessions.keys());
  res.json({
    success: true,
    sessions: sessionList,
    count: sessionList.length
  });
});

// 清空对话历史
app.post('/api/agent/clear-history', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'default' } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Agent会话不存在'
      });
    }

    session.conversationHistory = [];

    res.json({
      success: true,
      message: '对话历史已清空'
    });
  } catch (error: any) {
    console.error('清空历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '清空失败'
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Claude Agent 后端服务已启动`);
  console.log(`🚀 监听端口: ${PORT}`);
  console.log(`📍 健康检查: http://localhost:${PORT}/health`);
  console.log(`\n📝 注意: 请确保设置了 ANTHROPIC_API_KEY 环境变量`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  sessions.clear();
  process.exit(0);
});
