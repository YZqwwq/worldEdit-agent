/**
 * 聊天服务层
 * 展示Entity和VO层的正确使用方式
 * 
 * 数据流向：
 * Frontend (VO) -> Service Layer -> Repository (Entity) -> Database
 * Database -> Repository (Entity) -> Service Layer -> Frontend (VO)
 */

import { Repository } from 'typeorm';
import { ChatSession as ChatSessionEntity } from '../../shared/entities/agent/ChatSession.entity';
import { ChatMessage as ChatMessageEntity } from '../../shared/entities/agent/ChatMessage.entity';
import { ChatSessionVO } from '../../shared/cache-types/agent/vo/ChatSession';
import { ChatMessageVO } from '../../shared/cache-types/agent/vo/ChatMessage';
import { ChatSessionMapper, ChatMessageMapper } from '../../shared/mappers';
import { SessionStatus } from '../../shared/cache-types/agent/Enum/sessionStatusEnum';
import { MessageRole, MessageType } from '../../shared/cache-types/agent/Enum/chatMessageTypeEnum';

export class ChatService {
  constructor(
    private chatSessionRepository: Repository<ChatSessionEntity>,
    private chatMessageRepository: Repository<ChatMessageEntity>
  ) {}

  /**
   * 创建新的聊天会话
   * 输入：前端VO -> 转换为Entity -> 保存到数据库 -> 返回VO给前端
   */
  async createSession(sessionData: Partial<ChatSessionVO>): Promise<ChatSessionVO> {
    try {
      // 1. VO转Entity（业务逻辑层处理）
      const entityData = ChatSessionMapper.voToEntity({
        title: sessionData.title || '新对话',
        agentConfigId: sessionData.agentConfigId!,
        status: SessionStatus.ACTIVE,
        messageCount: 0,
        totalTokens: 0,
        ...sessionData
      } as ChatSessionVO);

      // 2. 创建Entity实例
      const sessionEntity = this.chatSessionRepository.create(entityData);

      // 3. 保存到数据库
      const savedEntity = await this.chatSessionRepository.save(sessionEntity);

      // 4. Entity转VO返回给前端
      return ChatSessionMapper.entityToVO(savedEntity);
    } catch (error) {
      throw new Error(`创建会话失败: ${error.message}`);
    }
  }

  /**
   * 获取会话列表（轻量级，不包含消息）
   * 数据库Entity -> 转换为轻量级VO -> 返回给前端
   */
  async getSessionList(agentConfigId: string): Promise<Omit<ChatSessionVO, 'messages' | 'tokenUsages'>[]> {
    try {
      // 1. 从数据库查询Entity
      const entities = await this.chatSessionRepository.find({
        where: { 
          agentConfigId,
          isDeleted: false 
        },
        order: { updatedAt: 'DESC' }
      });

      // 2. Entity转轻量级VO
      return entities.map(entity => ChatSessionMapper.entityToLightVO(entity));
    } catch (error) {
      throw new Error(`获取会话列表失败: ${error.message}`);
    }
  }

  /**
   * 获取完整会话详情（包含消息）
   * 数据库Entity -> 转换为完整VO -> 返回给前端
   */
  async getSessionDetail(sessionId: string): Promise<ChatSessionVO | null> {
    try {
      // 1. 从数据库查询Entity（包含关联数据）
      const entity = await this.chatSessionRepository.findOne({
        where: { id: sessionId, isDeleted: false },
        relations: ['messages', 'tokenUsages'],
        order: {
          messages: { createdAt: 'ASC' } // 消息按时间排序
        }
      });

      if (!entity) {
        return null;
      }

      // 2. Entity转完整VO
      return ChatSessionMapper.entityToVO(entity);
    } catch (error) {
      throw new Error(`获取会话详情失败: ${error.message}`);
    }
  }

  /**
   * 添加消息到会话
   * 输入：前端VO -> 转换为Entity -> 保存到数据库 -> 更新会话统计 -> 返回VO给前端
   */
  async addMessage(messageData: Partial<ChatMessageVO>): Promise<ChatMessageVO> {
    try {
      // 1. VO转Entity
      const entityData = ChatMessageMapper.voToEntity({
        role: MessageRole.USER,
        type: MessageType.TEXT,
        content: '',
        ...messageData
      } as ChatMessageVO);

      // 2. 创建并保存消息Entity
      const messageEntity = this.chatMessageRepository.create(entityData);
      const savedMessage = await this.chatMessageRepository.save(messageEntity);

      // 3. 更新会话统计（业务逻辑）
      await this.updateSessionStats(messageData.sessionId!);

      // 4. Entity转VO返回
      return ChatMessageMapper.entityToVO(savedMessage);
    } catch (error) {
      throw new Error(`添加消息失败: ${error.message}`);
    }
  }

  /**
   * 更新会话统计信息
   * 这是纯Entity层的操作，不涉及VO转换
   */
  private async updateSessionStats(sessionId: string): Promise<void> {
    try {
      // 1. 查询会话Entity
      const session = await this.chatSessionRepository.findOne({
        where: { id: sessionId }
      });

      if (!session) {
        throw new Error('会话不存在');
      }

      // 2. 计算统计信息
      const messageCount = await this.chatMessageRepository.count({
        where: { sessionId, isDeleted: false }
      });

      const totalTokensResult = await this.chatMessageRepository
        .createQueryBuilder('message')
        .select('SUM(message.tokenCount)', 'total')
        .where('message.sessionId = :sessionId', { sessionId })
        .andWhere('message.isDeleted = false')
        .getRawOne();

      // 3. 更新Entity
      session.messageCount = messageCount;
      session.totalTokens = totalTokensResult?.total || 0;
      session.lastMessageAt = new Date();

      // 4. 保存更新
      await this.chatSessionRepository.save(session);
    } catch (error) {
      throw new Error(`更新会话统计失败: ${error.message}`);
    }
  }

  /**
   * 更新会话信息
   * 输入：前端VO -> 查询现有Entity -> 合并更新 -> 保存 -> 返回VO给前端
   */
  async updateSession(sessionId: string, updateData: Partial<ChatSessionVO>): Promise<ChatSessionVO> {
    try {
      // 1. 查询现有Entity
      const existingEntity = await this.chatSessionRepository.findOne({
        where: { id: sessionId, isDeleted: false }
      });

      if (!existingEntity) {
        throw new Error('会话不存在');
      }

      // 2. 使用Mapper合并更新数据
      const updatedEntity = ChatSessionMapper.updateEntityFromVO(
        existingEntity, 
        updateData as ChatSessionVO
      );

      // 3. 保存更新
      const savedEntity = await this.chatSessionRepository.save(updatedEntity);

      // 4. Entity转VO返回
      return ChatSessionMapper.entityToVO(savedEntity);
    } catch (error) {
      throw new Error(`更新会话失败: ${error.message}`);
    }
  }

  /**
   * 软删除会话
   * 这是纯Entity操作，标记删除而不是物理删除
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      // 1. 更新Entity的删除标记
      const result = await this.chatSessionRepository.update(
        { id: sessionId },
        { 
          isDeleted: true,
          status: SessionStatus.ARCHIVED
        }
      );

      // 2. 同时软删除相关消息
      await this.chatMessageRepository.update(
        { sessionId },
        { isDeleted: true }
      );

      return result.affected! > 0;
    } catch (error) {
      throw new Error(`删除会话失败: ${error.message}`);
    }
  }

  /**
   * 获取会话消息（分页）
   * 展示如何处理大量数据的VO转换
   */
  async getSessionMessages(
    sessionId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{ messages: ChatMessageVO[], total: number, hasMore: boolean }> {
    try {
      // 1. 分页查询Entity
      const [entities, total] = await this.chatMessageRepository.findAndCount({
        where: { sessionId, isDeleted: false },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit
      });

      // 2. 批量Entity转VO
      const messages = ChatMessageMapper.entitiesToVOs(entities);

      // 3. 返回分页结果
      return {
        messages,
        total,
        hasMore: total > page * limit
      };
    } catch (error) {
      throw new Error(`获取会话消息失败: ${error.message}`);
    }
  }
}