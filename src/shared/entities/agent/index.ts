import { AgentConfig } from './AgentConfig.entity';
import { AgentState } from './AgentState.entity';
import { ChatMessage } from './ChatMessage.entity';
import { ChatSession } from './ChatSession.entity';
import { TokenUsage } from './TokenUsage.entity';
import { ToolCall } from './ToolCall.entity';

// Agent相关实体类导出
export { AgentConfig } from './AgentConfig.entity';
export { AgentState } from './AgentState.entity';
export { ChatMessage } from './ChatMessage.entity';
export { ChatSession } from './ChatSession.entity';
export { ToolCall, ToolCallStatus, ToolType } from './ToolCall.entity';
export { TokenUsage, UsageType } from './TokenUsage.entity';

// 从正确的位置导出枚举
export { AgentStatus } from '../../cache-types/agent/agentStatusEnum';
export { AgentMode } from '../../cache-types/agent/modelEnum';
export { MessageRole, MessageType } from '../../cache-types/agent/chatMessageTypeEnum';
export { SessionStatus } from '../../cache-types/session/session-manager.types';

// 导出所有Agent相关实体类的数组
export const agentEntities = [
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  TokenUsage,
  ToolCall
];