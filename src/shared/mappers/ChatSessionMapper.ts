/**
 * ChatSession 数据转换器
 * 负责Entity和VO之间的双向转换
 */

import { ChatSession as ChatSessionEntity } from '../entities/agent/ChatSession.entity';
import { ChatSessionVO } from '../cache-types/agent/vo/ChatSession';
import { SessionStatus } from '../cache-types/agent/Enum/sessionStatusEnum';
import { ChatMessageMapper } from './ChatMessageMapper';

export class ChatSessionMapper {
  /**
   * Entity转换为VO
   * 用于从数据库读取数据后传递给前端
   */
  static entityToVO(entity: ChatSessionEntity): ChatSessionVO {
    return {
      id: entity.id,
      title: entity.title,
      agentConfigId: entity.agentConfigId,
      status: entity.status || SessionStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      lastMessageAt: entity.lastMessageAt,
      messageCount: entity.messageCount || 0,
      totalTokens: entity.totalTokens || 0,
      metadata: entity.metadata,
      isDeleted: entity.isDeleted || false,
      // 关联数据转换
      messages: entity.messages ? ChatMessageMapper.entitiesToVOs(entity.messages) : [],
      tokenUsages: entity.tokenUsages || [],
      // 前端特有字段，设置默认值
      isActive: entity.status === SessionStatus.ACTIVE,
      unreadCount: 0
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: ChatSessionVO): Partial<ChatSessionEntity> {
    return {
      id: vo.id,
      title: vo.title,
      agentConfigId: vo.agentConfigId,
      status: vo.status || SessionStatus.ACTIVE,
      messageCount: vo.messageCount || 0,
      totalTokens: vo.totalTokens || 0,
      metadata: vo.metadata,
      isDeleted: vo.isDeleted || false,
      lastMessageAt: vo.lastMessageAt
      // 注意：不包含关联数据和前端特有字段
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: ChatSessionEntity[]): ChatSessionVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: ChatSessionVO[]): Partial<ChatSessionEntity>[] {
    return vos.map(vo => this.voToEntity(vo));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新操作，保留Entity的数据库特有字段
   */
  static updateEntityFromVO(entity: ChatSessionEntity, vo: ChatSessionVO): ChatSessionEntity {
    // 只更新允许修改的字段
    entity.title = vo.title;
    entity.status = vo.status;
    entity.metadata = vo.metadata;
    entity.isDeleted = vo.isDeleted || false;
    entity.messageCount = vo.messageCount || 0;
    entity.totalTokens = vo.totalTokens || 0;
    entity.lastMessageAt = vo.lastMessageAt;
    
    // 不更新：id, agentConfigId, createdAt等关键字段
    return entity;
  }

  /**
   * 轻量级VO转换（不包含关联数据）
   * 用于列表显示等场景，提高性能
   */
  static entityToLightVO(entity: ChatSessionEntity): Omit<ChatSessionVO, 'messages' | 'tokenUsages'> {
    return {
      id: entity.id,
      title: entity.title,
      agentConfigId: entity.agentConfigId,
      status: entity.status || SessionStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      lastMessageAt: entity.lastMessageAt,
      messageCount: entity.messageCount || 0,
      totalTokens: entity.totalTokens || 0,
      metadata: entity.metadata,
      isDeleted: entity.isDeleted || false,
      isActive: entity.status === SessionStatus.ACTIVE,
      unreadCount: 0
    };
  }
}