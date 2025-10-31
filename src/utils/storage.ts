import type { AgentConfig } from '../types';

const STORAGE_KEY = 'claude_agent_config';

export const storage = {
  // 保存配置
  saveConfig(config: AgentConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  },

  // 读取配置
  loadConfig(): AgentConfig | null {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  // 清除配置
  clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
