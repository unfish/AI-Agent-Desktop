export interface ContentBlock {
  type: 'text' | 'tool';
  text?: string;
  tool?: {
    name: string;
    input: any;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // 用于用户消息
  contentBlocks?: ContentBlock[]; // 用于助手消息的有序内容块
  timestamp: Date;
}

export interface ToolUse {
  name: string;
  input: any;
}

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  authToken: string;
  systemPromptType?: string;
  systemPromptContent?: string;
}

export interface SystemPrompt {
  name: string;
  prompt: string;
}

export interface AgentSettings {
  systemPrompt: string;
  allowedTools: string[];
  config: AgentConfig;
}

export interface StreamMessage {
  type: 'text' | 'tool_use' | 'complete' | 'error';
  content?: string;
  tool?: string;
  input?: any;
  error?: string;
  timestamp: string;
}
