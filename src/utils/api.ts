import axios from 'axios';
import type { AgentConfig, StreamMessage } from '../types';

const API_BASE_URL = 'http://localhost:3000';

export const api = {
  // 健康检查
  async healthCheck() {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },

  // 创建Agent会话
  async createAgent(
    sessionId: string,
    systemPrompt: string,
    allowedTools: string[],
    config: AgentConfig
  ) {
    const response = await axios.post(`${API_BASE_URL}/api/agent/create`, {
      sessionId,
      systemPrompt,
      allowedTools,
      config,
    });
    return response.data;
  },

  // 流式查询Agent
  async queryAgentStream(
    sessionId: string,
    message: string,
    onMessage: (msg: StreamMessage) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/query-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');

        // 保留最后一行（可能不完整）
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamMessage;

              if (data.type === 'complete') {
                onComplete();
              } else if (data.type === 'error') {
                onError(data.error || '未知错误');
              } else {
                onMessage(data);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      onError(error.message || '查询失败');
    }
  },

  // 非流式查询Agent
  async queryAgent(sessionId: string, message: string) {
    const response = await axios.post(`${API_BASE_URL}/api/agent/query`, {
      sessionId,
      message,
    });
    return response.data;
  },

  // 中断Agent执行
  async interruptAgent(sessionId: string) {
    const response = await axios.post(`${API_BASE_URL}/api/agent/interrupt`, {
      sessionId,
    });
    return response.data;
  },

  // 关闭Agent会话
  async closeAgent(sessionId: string) {
    const response = await axios.post(`${API_BASE_URL}/api/agent/close`, {
      sessionId,
    });
    return response.data;
  },

  // 获取会话列表
  async getSessions() {
    const response = await axios.get(`${API_BASE_URL}/api/agent/sessions`);
    return response.data;
  },

  // 获取预设系统提示词
  async getSystemPrompts() {
    const response = await axios.get(`${API_BASE_URL}/api/agent/prompts`);
    return response.data;
  },
};
