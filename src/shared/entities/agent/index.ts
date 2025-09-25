import { AgentConfig } from './AgentConfig.entity';
import { AgentState } from './AgentState.entity';
import { ChatMessage } from './ChatMessage.entity';
import { ChatSession } from './ChatSession.entity';
import { TokenUsage } from './TokenUsage.entity';
import { ToolCall } from './ToolCall.entity';

// Agent相关实体类导出
export { AgentConfig } from './AgentConfig.entity';
export { ChatMessage, MessageRole, MessageType } from './ChatMessage.entity';
export { ChatSession, SessionStatus } from './ChatSession.entity';
export { AgentState, AgentStatus, AgentMode } from './AgentState.entity';
export { TokenUsage, UsageType } from './TokenUsage.entity';
export { ToolCall, ToolCallStatus, ToolType } from './ToolCall.entity';

// 导出所有Agent相关实体类的数组
export const agentEntities = [
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  TokenUsage,
  ToolCall
];