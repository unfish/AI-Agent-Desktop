import React, { useState, useEffect, useRef } from 'react';
import { Bubble, Sender } from '@ant-design/x';
import { Button, Space, Tag, App } from 'antd';
import {
  SettingOutlined,
  DeleteOutlined,
  StopOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Message, AgentConfig, StreamMessage } from '../types';
import { api } from '../utils/api';
import SettingsModal from './SettingsModal';
import { storage } from '../utils/storage';
import MarkdownIt from 'markdown-it';

interface ChatInterfaceProps {
  initialConfig?: AgentConfig;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ initialConfig }) => {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(
    initialConfig || {
      baseUrl: '',
      apiKey: '',
      authToken: '',
      systemPromptType: 'general',
      systemPromptContent: '',
    }
  );
  const [currentPromptName, setCurrentPromptName] = useState('通用助手');
  const [elapsedTime, setElapsedTime] = useState(0);
  const currentResponseRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionId = 'default';

  // 初始化 markdown-it
  const md = useRef(new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })).current;

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 计时器效果
  useEffect(() => {
    if (loading) {
      // 开始计时
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      // 停止计时
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [loading]);

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 预设提示词
  const promptItems = [
    { key: '1', label: '帮我分析这段代码' },
    { key: '2', label: '解释一下这个算法' },
    { key: '3', label: '如何优化数据库查询' },
    { key: '4', label: '写一个脚本处理文件' },
    { key: '5', label: '帮我写一篇营销文案' },
    { key: '6', label: '帮我调研市场竞争情况' },
  ];

  useEffect(() => {
    // 加载保存的配置
    const savedConfig = storage.loadConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      // 加载提示词名称
      loadPromptName(savedConfig.systemPromptType);
      // 检查是否有认证信息（API Key 或 Auth Token）
      if (savedConfig.apiKey || savedConfig.authToken) {
        initializeAgent(savedConfig);
      } else {
        setSettingsVisible(true);
      }
    } else {
      // 没有配置，打开设置
      setSettingsVisible(true);
    }
  }, []);

  const loadPromptName = async (promptType?: string) => {
    try {
      const response = await api.getSystemPrompts();
      if (response.success && promptType && response.prompts[promptType]) {
        setCurrentPromptName(response.prompts[promptType].name);
      }
    } catch (error) {
      console.error('加载提示词名称失败:', error);
    }
  };

  const initializeAgent = async (agentConfig: AgentConfig) => {
    try {
      setLoading(true);

      // 检查后端健康状态
      await api.healthCheck();

      // 创建Agent会话
      await api.createAgent(
        sessionId,
        agentConfig.systemPromptContent || '你是一个专业的AI助手。',
        ['Read', 'Write', 'Bash', 'Grep', 'Glob'],
        agentConfig
      );

      setIsInitialized(true);
      message.success('Agent初始化成功');
    } catch (error: any) {
      console.error('初始化Agent失败:', error);
      message.error(`初始化失败: ${error.message || '请检查后端服务是否启动'}`);
      setSettingsVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    if (!isInitialized) {
      message.warning('请先配置并初始化Agent');
      setSettingsVisible(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    currentResponseRef.current = '';

    // 创建助手消息占位
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      contentBlocks: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      await api.queryAgentStream(
        sessionId,
        text,
        (msg: StreamMessage) => {
          if (msg.type === 'text') {
            currentResponseRef.current += msg.content || '';
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantMessageId) {
                  const blocks = [...(m.contentBlocks || [])];
                  // 如果最后一个块是文本，更新它；否则添加新的文本块
                  if (blocks.length > 0 && blocks[blocks.length - 1].type === 'text') {
                    blocks[blocks.length - 1] = {
                      type: 'text',
                      text: currentResponseRef.current
                    };
                  } else {
                    blocks.push({
                      type: 'text',
                      text: currentResponseRef.current
                    });
                  }
                  return { ...m, contentBlocks: blocks, timestamp: new Date() };
                }
                return m;
              })
            );
          } else if (msg.type === 'tool_use') {
            // 遇到工具调用时，先保存当前文本（如果有），然后添加工具块
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantMessageId) {
                  const blocks = [...(m.contentBlocks || [])];
                  // 添加工具调用块
                  blocks.push({
                    type: 'tool',
                    tool: {
                      name: msg.tool || '',
                      input: msg.input
                    }
                  });
                  // 重置当前文本，为下一段文本做准备
                  currentResponseRef.current = '';
                  return { ...m, contentBlocks: blocks };
                }
                return m;
              })
            );
          }
        },
        () => {
          setLoading(false);
        },
        (error: string) => {
          message.error(`查询失败: ${error}`);
          setLoading(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: `❌ 错误: ${error}` }
                : m
            )
          );
        }
      );
    } catch (error: any) {
      message.error(`发送消息失败: ${error.message}`);
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      await api.interruptAgent(sessionId);
      setLoading(false);
      message.success('已停止执行');
    } catch (error: any) {
      message.error(`停止失败: ${error.message}`);
    }
  };

  const handleClear = () => {
    setMessages([]);
    message.success('对话已清空');
  };

  const handleSaveConfig = (newConfig: AgentConfig) => {
    setConfig(newConfig);
    loadPromptName(newConfig.systemPromptType);
    setIsInitialized(false);
    setMessages([]);
    initializeAgent(newConfig);
  };

  const handlePromptClick = (promptText: string) => {
    setInputValue(promptText);
    // 使用 setTimeout 确保输入框已经更新后再聚焦
    setTimeout(() => {
      const inputElement = document.querySelector('textarea') as HTMLTextAreaElement;
      if (inputElement) {
        inputElement.focus();
        // 将光标移到文本末尾
        inputElement.setSelectionRange(promptText.length, promptText.length);
      }
    }, 0);
  };

  // 格式化工具调用显示
  const formatToolCall = (toolName: string, input: any): string => {
    try {
      switch (toolName) {
        case 'Bash':
          return `$ ${input.command || ''}`;
        case 'Read':
          return `📖 Read: ${input.file_path || ''}`;
        case 'Write':
          const path = input.file_path || '';
          const lines = input.content ? input.content.split('\n').length : 0;
          return `✍️ Write: ${path} (${lines} lines)`;
        case 'Edit':
          return `✏️ Edit: ${input.file_path || ''}`;
        case 'Grep':
          return `🔍 Grep: "${input.pattern || ''}" ${input.path ? `in ${input.path}` : ''}`;
        case 'Glob':
          return `📁 Glob: ${input.pattern || ''}`;
        default:
          // 尝试从 input 中提取关键信息
          if (input.command) return `${toolName}: ${input.command}`;
          if (input.file_path) return `${toolName}: ${input.file_path}`;
          if (input.pattern) return `${toolName}: ${input.pattern}`;
          return `${toolName}`;
      }
    } catch (e) {
      return toolName;
    }
  };

  // 转换消息为 Bubble.List 的 items 格式
  const bubbleItems = React.useMemo(() => {
    return messages
      .filter(msg => msg.role !== 'system')
      .map((msg) => {
        const isUser = msg.role === 'user';
        const isAssistant = msg.role === 'assistant';
        const isStreaming = isAssistant && loading && msg.id === messages[messages.length - 1]?.id;

        let displayContent;

        if (isUser) {
          // 用户消息直接显示
          displayContent = msg.content;
        } else if (isAssistant) {
          // 助手消息使用 contentBlocks
          const blocks = msg.contentBlocks || [];

          displayContent = (
            <div>
              {blocks.map((block, idx) => {
                if (block.type === 'text') {
                  // 文本块
                  const text = block.text || '';
                  if (isStreaming && idx === blocks.length - 1) {
                    // 最后一个文本块在流式输出时显示纯文本
                    return (
                      <div key={idx} style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                        {text}
                      </div>
                    );
                  } else {
                    // 完成的文本块渲染 markdown
                    return (
                      <div key={idx} style={{ marginBottom: 8 }}>
                        <div dangerouslySetInnerHTML={{ __html: md.render(text) }} />
                      </div>
                    );
                  }
                } else if (block.type === 'tool' && block.tool) {
                  // 工具调用块
                  const toolText = formatToolCall(block.tool.name, block.tool.input);
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#f5f5f5',
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        padding: '8px 12px',
                        marginBottom: 8,
                        fontFamily: 'monospace',
                        fontSize: 13,
                        color: '#1890ff',
                      }}
                    >
                      {toolText}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        } else {
          displayContent = msg.content;
        }

        return {
          key: msg.id,
          role: isUser ? 'user' : 'assistant',
          content: displayContent,
        };
      });
  }, [messages, loading, formatToolCall]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f0f2f5',
      }}
    >
      {/* 头部工具栏 */}
      <div
        style={{
          background: '#fff',
          padding: '12px 24px',
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{currentPromptName}</h2>
          {isInitialized ? (
            <Tag color="green">已连接</Tag>
          ) : (
            <Tag color="red">未连接</Tag>
          )}
        </div>

        <Space>
          {loading && (
            <>
              <span style={{
                fontSize: 16,
                fontWeight: 500,
                color: '#1890ff',
                fontFamily: 'monospace',
                minWidth: 60,
                display: 'inline-block',
                textAlign: 'center'
              }}>
                {formatTime(elapsedTime)}
              </span>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleStop}
              >
                停止
              </Button>
            </>
          )}
          <Button icon={<DeleteOutlined />} onClick={handleClear}>
            清空
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setSettingsVisible(true)}
          >
            设置
          </Button>
        </Space>
      </div>

      {/* 聊天区域 */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {messages.filter(m => m.role !== 'system').length === 0 && !loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '40px 24px',
              maxWidth: 1000,
              margin: '0 auto',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <RobotOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
              <h2 style={{ fontSize: 28, margin: '0 0 12px 0', fontWeight: 600 }}>
                欢迎使用 {currentPromptName}
              </h2>
              <p style={{ fontSize: 16, color: '#666', maxWidth: 560, margin: '0 auto' }}>
                {isInitialized
                  ? '一个强大的AI助手，帮助你完成各种任务。选择下方的快捷提示开始对话。'
                  : '请先在右上角点击"设置"按钮配置 API 认证信息。'}
              </p>
            </div>

            {isInitialized && (
              <div style={{ width: '100%', maxWidth: 800 }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 500,
                  marginBottom: 16,
                  color: '#333',
                  textAlign: 'center'
                }}>
                  快速开始：
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}>
                  {promptItems.map((item) => (
                    <Button
                      key={item.key}
                      size="large"
                      style={{
                        height: 'auto',
                        padding: '16px',
                        textAlign: 'left',
                        whiteSpace: 'normal',
                        lineHeight: 1.5,
                        fontSize: 14,
                      }}
                      onClick={() => handlePromptClick(item.label)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '16px 24px', maxWidth: 900, margin: '0 auto' }}>
            <Bubble.List
              items={bubbleItems}
              roles={{
                user: {
                  placement: 'end',
                  variant: 'filled',
                  styles: {
                    content: {
                      background: '#1890ff',
                      color: '#fff',
                    },
                  },
                },
                assistant: {
                  placement: 'start',
                  avatar: { icon: <RobotOutlined />, style: { background: '#1890ff' } },
                  variant: 'filled',
                  styles: {
                    content: {
                      background: '#ffffff',
                      color: '#000',
                      width: '100%',
                    },
                  },
                },
              }}
              style={{
                paddingBottom: 16,
              }}
            />
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div
        style={{
          background: '#fff',
          padding: '16px 24px',
          borderTop: '1px solid #e8e8e8',
        }}
      >
        <Sender
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSend}
          placeholder={
            isInitialized
              ? '输入消息...（Shift+Enter换行）'
              : '请先配置Agent'
          }
          disabled={!isInitialized || loading}
          loading={loading}
          style={{ background: '#fafafa' }}
        />
      </div>

      {/* 设置模态框 */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSave={handleSaveConfig}
        currentConfig={config}
      />
    </div>
  );
};

export default ChatInterface;
