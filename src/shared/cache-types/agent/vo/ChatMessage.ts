import { MessageRole, MessageType } from '../Enum/chatMessageTypeEnum';

/**
 * 聊天消息接口 - VO层
 * 用于前端状态管理，包含实体字段和前端特有字段
 */
export interface ChatMessageVO {
  /** 消息ID */
  id: string;
  
  /** 会话ID */
  sessionId?: string;
  
  /** 消息角色 */
  role: MessageRole;
  
  /** 消息类型 */
  type?: MessageType;
  
  /** 消息内容 */
  content: string;
  
  /** 工具调用 */
  toolCalls?: any[];
  
  /** 工具调用ID */
  toolCallId?: string;
  
  /** 模型名称 */
  model?: string;
  
  /** 令牌数量 */
  tokenCount?: number;
  
  /** 创建时间 */
  createdAt?: Date;
  
  /** 更新时间 */
  updatedAt?: Date;
  
  /** 时间戳（前端使用） */
  timestamp?: Date;
  
  /** 元数据 */
  metadata?: Record<string, any>;
  
  /** 错误信息 */
  error?: string;
  
  /** 是否已删除 */
  isDeleted?: boolean;
  
  // 前端特有字段
  /** 附件（前端使用） */
  attachments?: any[];
  
  /** 是否正在流式输出（前端使用） */
  isStreaming?: boolean;
}