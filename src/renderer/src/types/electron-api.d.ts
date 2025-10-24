/**
 * Electron API 类型定义
 * 确保前端调用主进程IPC时的类型安全
 */

import { ChatSessionVO } from '../../../shared/cache-types/agent/vo/ChatSession';
import { ChatMessageVO } from '../../../shared/cache-types/agent/vo/ChatMessage';

declare global {
  interface Window {
    electronAPI: {
      // ===== 聊天相关API =====
      chat: {
        // 会话管理
        getSessions(agentConfigId: string): Promise<Omit<ChatSessionVO, 'messages' | 'tokenUsages'>[]>;
        getSessionDetail(sessionId: string): Promise<ChatSessionVO | null>;
        createSession(sessionData: Partial<ChatSessionVO>): Promise<ChatSessionVO>;
        updateSession(sessionId: string, updateData: Partial<ChatSessionVO>): Promise<ChatSessionVO>;
        deleteSession(sessionId: string): Promise<boolean>;

        // 消息管理
        getMessages(
          sessionId: string, 
          page?: number, 
          limit?: number
        ): Promise<{ messages: ChatMessageVO[], total: number, hasMore: boolean }>;
        sendMessage(messageData: Partial<ChatMessageVO>): Promise<ChatMessageVO>;
        updateMessage(messageId: string, updateData: Partial<ChatMessageVO>): Promise<ChatMessageVO>;
        deleteMessage(messageId: string): Promise<boolean>;

        // 流式对话
        startStream(sessionId: string, messageContent: string): Promise<{ messageId: string }>;

        // 搜索和统计
        searchMessages(sessionId: string, query: string, limit?: number): Promise<ChatMessageVO[]>;
        getSessionStats(sessionId: string): Promise<{
          messageCount: number;
          totalTokens: number;
          averageResponseTime: number;
        }>;

        // 事件监听
        onStreamChunk(callback: (data: {
          messageId: string;
          sessionId: string;
          content: string;
          isComplete: boolean;
        }) => void): void;
        onStreamComplete(callback: (data: {
          messageId: string;
          sessionId: string;
          content: string;
          isComplete: boolean;
        }) => void): void;
        removeStreamListeners(): void;
      };

      // ===== 其他现有API =====
      // 这里可以添加其他已存在的API定义
      // 例如：world, agent, config等
    };
  }
}

export {};