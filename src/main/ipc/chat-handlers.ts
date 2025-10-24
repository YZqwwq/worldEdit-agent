/**
 * 聊天相关IPC处理器
 * 展示主进程如何处理前端的VO数据请求
 * 
 * 数据流：
 * Frontend (VO) -> IPC -> Main Process -> Service Layer (VO) -> Repository (Entity) -> Database
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { ChatSessionVO } from '../../shared/cache-types/agent/vo/ChatSession';
import { ChatMessageVO } from '../../shared/cache-types/agent/vo/ChatMessage';
import { ChatService } from '../services/ChatService';
import { getRepository } from 'typeorm';
import { ChatSession as ChatSessionEntity } from '../../shared/entities/agent/ChatSession.entity';
import { ChatMessage as ChatMessageEntity } from '../../shared/entities/agent/ChatMessage.entity';

// 聊天服务实例
let chatService: ChatService;

/**
 * 初始化聊天服务
 */
export function initializeChatService() {
  const chatSessionRepository = getRepository(ChatSessionEntity);
  const chatMessageRepository = getRepository(ChatMessageEntity);
  chatService = new ChatService(chatSessionRepository, chatMessageRepository);
}

/**
 * 注册所有聊天相关的IPC处理器
 */
export function registerChatHandlers() {
  // ===== 会话管理 =====

  /**
   * 获取会话列表
   */
  ipcMain.handle(
    'chat:get-sessions',
    async (event: IpcMainInvokeEvent, agentConfigId: string): Promise<Omit<ChatSessionVO, 'messages' | 'tokenUsages'>[]> => {
      try {
        return await chatService.getSessionList(agentConfigId);
      } catch (error) {
        console.error('IPC chat:get-sessions error:', error);
        throw new Error(`获取会话列表失败: ${error.message}`);
      }
    }
  );

  /**
   * 获取会话详情
   */
  ipcMain.handle(
    'chat:get-session-detail',
    async (event: IpcMainInvokeEvent, sessionId: string): Promise<ChatSessionVO | null> => {
      try {
        return await chatService.getSessionDetail(sessionId);
      } catch (error) {
        console.error('IPC chat:get-session-detail error:', error);
        throw new Error(`获取会话详情失败: ${error.message}`);
      }
    }
  );

  /**
   * 创建新会话
   */
  ipcMain.handle(
    'chat:create-session',
    async (event: IpcMainInvokeEvent, sessionData: Partial<ChatSessionVO>): Promise<ChatSessionVO> => {
      try {
        // 验证必要字段
        if (!sessionData.agentConfigId) {
          throw new Error('agentConfigId is required');
        }

        return await chatService.createSession(sessionData);
      } catch (error) {
        console.error('IPC chat:create-session error:', error);
        throw new Error(`创建会话失败: ${error.message}`);
      }
    }
  );

  /**
   * 更新会话
   */
  ipcMain.handle(
    'chat:update-session',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      updateData: Partial<ChatSessionVO>
    ): Promise<ChatSessionVO> => {
      try {
        return await chatService.updateSession(sessionId, updateData);
      } catch (error) {
        console.error('IPC chat:update-session error:', error);
        throw new Error(`更新会话失败: ${error.message}`);
      }
    }
  );

  /**
   * 删除会话
   */
  ipcMain.handle(
    'chat:delete-session',
    async (event: IpcMainInvokeEvent, sessionId: string): Promise<boolean> => {
      try {
        return await chatService.deleteSession(sessionId);
      } catch (error) {
        console.error('IPC chat:delete-session error:', error);
        throw new Error(`删除会话失败: ${error.message}`);
      }
    }
  );

  // ===== 消息管理 =====

  /**
   * 获取会话消息（分页）
   */
  ipcMain.handle(
    'chat:get-messages',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      page: number = 1,
      limit: number = 50
    ): Promise<{ messages: ChatMessageVO[], total: number, hasMore: boolean }> => {
      try {
        return await chatService.getSessionMessages(sessionId, page, limit);
      } catch (error) {
        console.error('IPC chat:get-messages error:', error);
        throw new Error(`获取消息失败: ${error.message}`);
      }
    }
  );

  /**
   * 发送消息
   */
  ipcMain.handle(
    'chat:send-message',
    async (event: IpcMainInvokeEvent, messageData: Partial<ChatMessageVO>): Promise<ChatMessageVO> => {
      try {
        // 验证必要字段
        if (!messageData.sessionId) {
          throw new Error('sessionId is required');
        }
        if (!messageData.content) {
          throw new Error('content is required');
        }

        return await chatService.addMessage(messageData);
      } catch (error) {
        console.error('IPC chat:send-message error:', error);
        throw new Error(`发送消息失败: ${error.message}`);
      }
    }
  );

  /**
   * 更新消息
   */
  ipcMain.handle(
    'chat:update-message',
    async (
      event: IpcMainInvokeEvent,
      messageId: string,
      updateData: Partial<ChatMessageVO>
    ): Promise<ChatMessageVO> => {
      try {
        // 这里需要在ChatService中添加updateMessage方法
        // return await chatService.updateMessage(messageId, updateData);
        throw new Error('updateMessage method not implemented yet');
      } catch (error) {
        console.error('IPC chat:update-message error:', error);
        throw new Error(`更新消息失败: ${error.message}`);
      }
    }
  );

  /**
   * 删除消息
   */
  ipcMain.handle(
    'chat:delete-message',
    async (event: IpcMainInvokeEvent, messageId: string): Promise<boolean> => {
      try {
        // 这里需要在ChatService中添加deleteMessage方法
        // return await chatService.deleteMessage(messageId);
        throw new Error('deleteMessage method not implemented yet');
      } catch (error) {
        console.error('IPC chat:delete-message error:', error);
        throw new Error(`删除消息失败: ${error.message}`);
      }
    }
  );

  // ===== 实时通信 =====

  /**
   * 开始流式对话
   * 这个方法不返回Promise，而是通过事件发送流式数据
   */
  ipcMain.handle(
    'chat:start-stream',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      messageContent: string
    ): Promise<{ messageId: string }> => {
      try {
        // 1. 保存用户消息
        const userMessage = await chatService.addMessage({
          sessionId,
          content: messageContent,
          role: 'user',
          type: 'text'
        } as Partial<ChatMessageVO>);

        // 2. 创建AI回复消息占位符
        const aiMessage = await chatService.addMessage({
          sessionId,
          content: '',
          role: 'assistant',
          type: 'text'
        } as Partial<ChatMessageVO>);

        // 3. 开始流式生成（这里是示例，实际需要集成AI服务）
        startStreamGeneration(event, aiMessage.id, sessionId);

        return { messageId: aiMessage.id };
      } catch (error) {
        console.error('IPC chat:start-stream error:', error);
        throw new Error(`开始流式对话失败: ${error.message}`);
      }
    }
  );

  // ===== 统计和搜索 =====

  /**
   * 搜索消息
   */
  ipcMain.handle(
    'chat:search-messages',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      query: string,
      limit: number = 20
    ): Promise<ChatMessageVO[]> => {
      try {
        // 这里需要在ChatService中添加searchMessages方法
        // return await chatService.searchMessages(sessionId, query, limit);
        throw new Error('searchMessages method not implemented yet');
      } catch (error) {
        console.error('IPC chat:search-messages error:', error);
        throw new Error(`搜索消息失败: ${error.message}`);
      }
    }
  );

  /**
   * 获取会话统计
   */
  ipcMain.handle(
    'chat:get-session-stats',
    async (event: IpcMainInvokeEvent, sessionId: string): Promise<{
      messageCount: number;
      totalTokens: number;
      averageResponseTime: number;
    }> => {
      try {
        // 这里需要在ChatService中添加getSessionStats方法
        // return await chatService.getSessionStats(sessionId);
        throw new Error('getSessionStats method not implemented yet');
      } catch (error) {
        console.error('IPC chat:get-session-stats error:', error);
        throw new Error(`获取会话统计失败: ${error.message}`);
      }
    }
  );
}

/**
 * 模拟流式生成过程
 * 实际项目中这里会集成真实的AI服务
 */
function startStreamGeneration(event: IpcMainInvokeEvent, messageId: string, sessionId: string) {
  const chunks = [
    '这是一个',
    '流式生成的',
    '示例回复。',
    '每个chunk会',
    '逐步发送给',
    '前端进行',
    '实时显示。'
  ];

  let currentContent = '';
  let chunkIndex = 0;

  const interval = setInterval(() => {
    if (chunkIndex < chunks.length) {
      currentContent += chunks[chunkIndex] + ' ';
      
      // 发送流式数据给前端
      event.sender.send('chat:stream-chunk', {
        messageId,
        sessionId,
        content: currentContent,
        isComplete: false
      });

      chunkIndex++;
    } else {
      // 流式生成完成
      event.sender.send('chat:stream-complete', {
        messageId,
        sessionId,
        content: currentContent.trim(),
        isComplete: true
      });

      clearInterval(interval);
    }
  }, 500); // 每500ms发送一个chunk
}

/**
 * 注销所有聊天相关的IPC处理器
 */
export function unregisterChatHandlers() {
  const handlers = [
    'chat:get-sessions',
    'chat:get-session-detail',
    'chat:create-session',
    'chat:update-session',
    'chat:delete-session',
    'chat:get-messages',
    'chat:send-message',
    'chat:update-message',
    'chat:delete-message',
    'chat:start-stream',
    'chat:search-messages',
    'chat:get-session-stats'
  ];

  handlers.forEach(handler => {
    ipcMain.removeAllListeners(handler);
  });
}