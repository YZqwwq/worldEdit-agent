import { ModelProvider } from '../Enum/modelEnum';

/**
 * 模型配置接口 - VO层
 * 用于中间状态和配置管理，不包含数据库相关字段
 */
export interface ModelConfig {
  /** 模型提供商 */
  provider: ModelProvider;
  
  /** 模型名称 */
  model: string;
  
  /** API密钥 */
  apiKey: string;
  
  /** 基础URL */
  baseUrl?: string;
  
  /** 温度参数 (0-2) */
  temperature: number;
  
  /** 最大令牌数 */
  maxTokens: number;
  
  /** Top-p 采样参数 */
  topP: number;
  
  /** 频率惩罚 */
  frequencyPenalty: number;
  
  /** 存在惩罚 */
  presencePenalty: number;
  
  /** 是否启用流式输出 */
  stream: boolean;
  
  /** 超时时间（毫秒） */
  timeout: number;
  
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 停止词 */
  stop?: string[];
}

/**
 * 从 AgentConfig 实体创建 ModelConfig VO
 */
export function createModelConfigFromAgent(agentConfig: Partial<{
  provider: ModelProvider;
  modelName: string;
  apiKey: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream: boolean;
  timeout: number;
  maxRetries: number;
  stop?: string[];
}>): ModelConfig {
  return {
    provider: agentConfig.provider || 'openai' as ModelProvider,
    model: agentConfig.modelName || 'gpt-3.5-turbo',
    apiKey: agentConfig.apiKey || '',
    baseUrl: agentConfig.baseURL || '',
    temperature: agentConfig.temperature || 0.7,
    maxTokens: agentConfig.maxTokens || 2000,
    topP: agentConfig.topP || 1,
    frequencyPenalty: agentConfig.frequencyPenalty || 0,
    presencePenalty: agentConfig.presencePenalty || 0,
    stream: agentConfig.stream || true,
    timeout: agentConfig.timeout || 30000,
    maxRetries: agentConfig.maxRetries || 3,
    stop: agentConfig.stop
  };
}

/**
 * 将 ModelConfig VO 转换为 AgentConfig 的部分字段
 */
export function modelConfigToAgentConfig(modelConfig: ModelConfig): Partial<{
  provider: ModelProvider;
  modelName: string;
  apiKey: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream: boolean;
  timeout: number;
  maxRetries: number;
  stop?: string[];
}> {
  return {
    provider: modelConfig.provider,
    modelName: modelConfig.model,
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseUrl,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    topP: modelConfig.topP,
    frequencyPenalty: modelConfig.frequencyPenalty,
    presencePenalty: modelConfig.presencePenalty,
    stream: modelConfig.stream,
    timeout: modelConfig.timeout,
    maxRetries: modelConfig.maxRetries,
    stop: modelConfig.stop
  };
}