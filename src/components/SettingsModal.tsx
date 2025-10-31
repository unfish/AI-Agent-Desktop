import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Space, Select } from 'antd';
import type { AgentConfig, SystemPrompt } from '../types';
import { storage } from '../utils/storage';
import { api } from '../utils/api';

const { TextArea } = Input;

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (config: AgentConfig) => void;
  currentConfig: AgentConfig;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onSave,
  currentConfig,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [systemPrompts, setSystemPrompts] = useState<Record<string, SystemPrompt>>({});

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(currentConfig);
      loadSystemPrompts();
    }
  }, [visible, currentConfig, form]);

  const loadSystemPrompts = async () => {
    try {
      const response = await api.getSystemPrompts();
      if (response.success) {
        setSystemPrompts(response.prompts);

        // 首次加载时，如果有选中的类型但没有内容，自动填充
        const currentType = form.getFieldValue('systemPromptType');
        const currentContent = form.getFieldValue('systemPromptContent');
        if (currentType && !currentContent && response.prompts[currentType]) {
          form.setFieldsValue({
            systemPromptContent: response.prompts[currentType].prompt
          });
        }
      }
    } catch (error) {
      console.error('加载系统提示词失败:', error);
    }
  };

  const handlePromptTypeChange = (value: string) => {
    if (systemPrompts[value]) {
      form.setFieldsValue({
        systemPromptContent: systemPrompts[value].prompt
      });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      // 验证至少有一个认证方式
      if (!values.apiKey && !values.authToken) {
        message.error('请至少填写 API Key 或 Auth Token 其中一项');
        setLoading(false);
        return;
      }

      // 保存到本地存储
      storage.saveConfig(values);

      // 通知父组件
      onSave(values);

      message.success('配置已保存');
      onClose();
    } catch (error) {
      console.error('保存配置失败:', error);
      message.error('保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要重置所有配置吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        storage.clearConfig();
        form.resetFields();
        message.success('配置已重置');
      },
    });
  };

  return (
    <Modal
      title="Agent 配置"
      open={visible}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="reset" onClick={handleReset}>
          重置
        </Button>,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" loading={loading} onClick={handleSave}>
          保存
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ systemPromptType: 'general', ...currentConfig }}
      >
        <Form.Item
          label="系统提示词类型"
          name="systemPromptType"
          tooltip="选择预设的系统提示词类型"
          rules={[{ required: true, message: '请选择系统提示词类型' }]}
        >
          <Select onChange={handlePromptTypeChange} placeholder="选择提示词类型">
            {Object.entries(systemPrompts).map(([key, value]) => (
              <Select.Option key={key} value={key}>
                {value.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="系统提示词内容"
          name="systemPromptContent"
          tooltip="可以查看和自定义系统提示词内容"
          rules={[{ required: true, message: '请输入系统提示词内容' }]}
        >
          <TextArea
            rows={8}
            placeholder="系统提示词内容"
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </Form.Item>

        <Form.Item
          label="ANTHROPIC_BASE_URL"
          name="baseUrl"
          tooltip="API基础URL，通常使用默认值即可"
          rules={[
            { required: false },
            { type: 'url', message: '请输入有效的URL' },
          ]}
        >
          <Input
            placeholder="https://api.anthropic.com"
            allowClear
          />
        </Form.Item>

        <Form.Item
          label="ANTHROPIC_API_KEY"
          name="apiKey"
          tooltip="Anthropic API密钥，与 Auth Token 二选一"
          rules={[{ required: false }]}
        >
          <Input.Password
            placeholder="sk-ant-..."
            allowClear
          />
        </Form.Item>

        <Form.Item
          label="ANTHROPIC_AUTH_TOKEN"
          name="authToken"
          tooltip="认证令牌，与 API Key 二选一"
          rules={[{ required: false }]}
        >
          <Input.Password
            placeholder="认证令牌"
            allowClear
          />
        </Form.Item>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <div style={{ fontSize: 12, color: '#666' }}>
              <strong>配置说明：</strong>
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              • API Key 或 Auth Token 至少填写一项
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              • API Key 可从 Anthropic 控制台获取
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              • Base URL 通常使用默认值，除非使用代理或私有部署
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              • 配置将保存在本地，下次启动自动加载
            </div>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default SettingsModal;
