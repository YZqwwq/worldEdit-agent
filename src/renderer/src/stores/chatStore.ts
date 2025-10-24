/**
 * 聊天状态管理Store
 * 展示前端如何正确使用VO层进行状态管理
 * 
 * 设计原则：
 * 1. 只使用VO对象，不直接使用Entity
 * 2. 通过IPC与主进程服务层通信
 * 3. 保持响应式状态管理
 * 4. 处理异步操作和错误状态
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ChatSessionVO } from '../../../shared/cache-types/agent/vo/ChatSession';
import { ChatMessageVO } from '../../../shared/cache-types/agent/vo/ChatMessage';
import { SessionStatus } from '../../../shared/cache-types/agent/Enum/sessionStatusEnum';
import { MessageRole, MessageType } from '../../../shared/cache-types/agent/Enum/chatMessageTypeEnum';

// 聊天状态接口
interface ChatState {
  // 会话相关
  sessions: ChatSessionVO[];
  currentSessionId: string | null;
  
  // 消息相关
  messages: ChatMessageVO[];
  isLoading: boolean;
  
  // UI状态
  isTyping: boolean;
  error: string | null;
}

export const useChatStore = defineStore('chat', () => {
  // ===== 状态定义 =====
  const sessions = ref<ChatSessionVO[]>([]);
  const currentSessionId = ref<string | null>(null);
  const messages = ref<ChatMessageVO[]>([]);
  const isLoading = ref(false);
  const isTyping = ref(false);
  const error = ref<string | null>(null);

  // ===== 计算属性 =====
  
  // 当前会话
  const currentSession = computed(() => {
    if (!currentSessionId.value) return null;
    return sessions.value.find(session => session.id === currentSessionId.value) || null;
  });

  // 活跃会话列表
  const activeSessions = computed(() => {
    return sessions.value.filter(session => 
      session.status === SessionStatus.ACTIVE && !session.isDeleted
    );
  });

  // 当前会话的消息
  const currentMessages = computed(() => {
    if (!currentSessionId.value) return [];
    return messages.value.filter(message => 
      message.sessionId === currentSessionId.value && !message.isDeleted
    );
  });

  // 未读消息数量
  const unreadCount = computed(() => {
    return sessions.value.reduce((count, session) => count + (session.unreadCount || 0), 0);
  });

  // ===== 会话管理动作 =====

  /**
   * 加载会话列表
   */
  const loadSessions = async (agentConfigId: string) => {
    try {
      isLoading.value = true;
      error.value = null;

      // 通过IPC调用主进程服务
      const sessionList = await window.electronAPI.chat.getSessions(agentConfigId);
      sessions.value = sessionList;
    } catch (err) {
      error.value = `加载会话列表失败: ${err.message}`;
      console.error('Failed to load sessions:', err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 创建新会话
   */
  const createSession = async (sessionData: Partial<ChatSessionVO>): Promise<ChatSessionVO | null> => {
    try {
      isLoading.value = true;
      error.value = null;

      // 构造会话VO数据
      const newSessionVO: Partial<ChatSessionVO> = {
        title: sessionData.title || '新对话',
        agentConfigId: sessionData.agentConfigId!,
        status: SessionStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        isActive: true,
        unreadCount: 0,
        ...sessionData
      };

      // 通过IPC创建会话
      const createdSession = await window.electronAPI.chat.createSession(newSessionVO);
      
      // 更新本地状态
      sessions.value.unshift(createdSession);
      
      return createdSession;
    } catch (err) {
      error.value = `创建会话失败: ${err.message}`;
      console.error('Failed to create session:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 切换当前会话
   */
  const switchSession = async (sessionId: string) => {
    try {
      isLoading.value = true;
      error.value = null;

      // 设置当前会话
      currentSessionId.value = sessionId;

      // 加载会话消息
      await loadMessages(sessionId);

      // 标记会话为已读
      const session = sessions.value.find(s => s.id === sessionId);
      if (session) {
        session.unreadCount = 0;
        session.isActive = true;
      }
    } catch (err) {
      error.value = `切换会话失败: ${err.message}`;
      console.error('Failed to switch session:', err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 更新会话信息
   */
  const updateSession = async (sessionId: string, updates: Partial<ChatSessionVO>) => {
    try {
      // 通过IPC更新会话
      const updatedSession = await window.electronAPI.chat.updateSession(sessionId, updates);
      
      // 更新本地状态
      const index = sessions.value.findIndex(s => s.id === sessionId);
      if (index !== -1) {
        sessions.value[index] = { ...sessions.value[index], ...updatedSession };
      }
    } catch (err) {
      error.value = `更新会话失败: ${err.message}`;
      console.error('Failed to update session:', err);
    }
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    try {
      // 通过IPC删除会话
      const success = await window.electronAPI.chat.deleteSession(sessionId);
      
      if (success) {
        // 从本地状态移除
        sessions.value = sessions.value.filter(s => s.id !== sessionId);
        
        // 如果删除的是当前会话，清空当前会话
        if (currentSessionId.value === sessionId) {
          currentSessionId.value = null;
          messages.value = [];
        }
      }
    } catch (err) {
      error.value = `删除会话失败: ${err.message}`;
      console.error('Failed to delete session:', err);
    }
  };

  // ===== 消息管理动作 =====

  /**
   * 加载会话消息
   */
  const loadMessages = async (sessionId: string, page: number = 1, limit: number = 50) => {
    try {
      isLoading.value = true;
      error.value = null;

      // 通过IPC加载消息
      const result = await window.electronAPI.chat.getMessages(sessionId, page, limit);
      
      if (page === 1) {
        // 首页，替换消息列表
        messages.value = result.messages;
      } else {
        // 分页，追加消息
        messages.value.push(...result.messages);
      }

      return result;
    } catch (err) {
      error.value = `加载消息失败: ${err.message}`;
      console.error('Failed to load messages:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 发送消息
   */
  const sendMessage = async (content: string, type: MessageType = MessageType.TEXT): Promise<ChatMessageVO | null> => {
    if (!currentSessionId.value) {
      error.value = '请先选择一个会话';
      return null;
    }

    try {
      isTyping.value = true;
      error.value = null;

      // 构造消息VO数据
      const messageVO: Partial<ChatMessageVO> = {
        sessionId: currentSessionId.value,
        role: MessageRole.USER,
        type,
        content,
        timestamp: new Date(),
        isStreaming: false,
        attachments: []
      };

      // 通过IPC发送消息
      const sentMessage = await window.electronAPI.chat.sendMessage(messageVO);
      
      // 更新本地状态
      messages.value.push(sentMessage);
      
      // 更新会话统计
      const session = sessions.value.find(s => s.id === currentSessionId.value);
      if (session) {
        session.messageCount = (session.messageCount || 0) + 1;
        session.lastMessageAt = sentMessage.createdAt;
      }

      return sentMessage;
    } catch (err) {
      error.value = `发送消息失败: ${err.message}`;
      console.error('Failed to send message:', err);
      return null;
    } finally {
      isTyping.value = false;
    }
  };

  /**
   * 接收AI回复（流式）
   */
  const receiveStreamMessage = (messageData: Partial<ChatMessageVO>) => {
    // 查找正在流式传输的消息
    const existingIndex = messages.value.findIndex(
      msg => msg.id === messageData.id && msg.isStreaming
    );

    if (existingIndex !== -1) {
      // 更新现有流式消息
      messages.value[existingIndex] = {
        ...messages.value[existingIndex],
        ...messageData
      };
    } else {
      // 添加新的流式消息
      const streamMessage: ChatMessageVO = {
        role: MessageRole.ASSISTANT,
        type: MessageType.TEXT,
        content: '',
        isStreaming: true,
        attachments: [],
        timestamp: new Date(),
        ...messageData
      } as ChatMessageVO;
      
      messages.value.push(streamMessage);
    }
  };

  /**
   * 完成流式消息
   */
  const completeStreamMessage = (messageId: string, finalData: Partial<ChatMessageVO>) => {
    const index = messages.value.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      messages.value[index] = {
        ...messages.value[index],
        ...finalData,
        isStreaming: false
      };
    }
  };

  // ===== 工具方法 =====

  /**
   * 清空错误状态
   */
  const clearError = () => {
    error.value = null;
  };

  /**
   * 重置状态
   */
  const reset = () => {
    sessions.value = [];
    currentSessionId.value = null;
    messages.value = [];
    isLoading.value = false;
    isTyping.value = false;
    error.value = null;
  };

  // ===== 返回store接口 =====
  return {
    // 状态
    sessions,
    currentSessionId,
    messages,
    isLoading,
    isTyping,
    error,
    
    // 计算属性
    currentSession,
    activeSessions,
    currentMessages,
    unreadCount,
    
    // 会话管理
    loadSessions,
    createSession,
    switchSession,
    updateSession,
    deleteSession,
    
    // 消息管理
    loadMessages,
    sendMessage,
    receiveStreamMessage,
    completeStreamMessage,
    
    // 工具方法
    clearError,
    reset
  };
});

// 类型导出，供其他组件使用
export type ChatStore = ReturnType<typeof useChatStore>;