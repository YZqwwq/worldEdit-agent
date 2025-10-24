import { SessionStatus } from '../Enum';
import { AgentConfig } from '../../../entities/agent/AgentConfig.entity';
import { TokenUsage } from '../../../entities/agent/TokenUsage.entity';
import { ChatMessageVO } from './ChatMessage';

/**
 * 聊天会话接口 - VO层
 * 用于前端状态管理，messages使用ChatMessageVO类型
 */
export interface ChatSessionVO {
  /** 会话ID */
  id: string;
  
  /** 会话标题 */
  title: string;
  
  /** Agent配置ID */
  agentConfigId: string;
  
  /** Agent配置 */
  agentConfig?: AgentConfig;
  
  /** 消息列表（使用VO类型） */
  messages: ChatMessageVO[];
  
  /** 令牌使用记录 */
  tokenUsages?: TokenUsage[];
  
  /** 会话状态 */
  status: SessionStatus;
  
  /** 上下文 */
  context?: string;
  
  /** 变量 */
  variables?: Record<string, any>;
  
  /** 消息数量 */
  messageCount: number;
  
  /** 总令牌数 */
  totalTokens: number;
  
  /** 总成本 */
  totalCost: number;
  
  /** 创建时间 */
  createdAt: Date;
  
  /** 更新时间 */
  updatedAt: Date;
  
  /** 最后活动时间 */
  lastActivityAt?: Date;
  
  /** 元数据 */
  metadata?: Record<string, any>;
  
  /** 是否已归档 */
  isArchived: boolean;
}