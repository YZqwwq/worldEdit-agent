/**
 * 支持的AI模型提供商
 */
export enum ModelProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek'
}


export enum AgentMode {
  CHAT = 'chat',
  TASK = 'task',
  TOOL = 'tool'
}