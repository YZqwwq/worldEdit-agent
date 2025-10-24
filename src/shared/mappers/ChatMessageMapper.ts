/**
 * ChatMessage 数据转换器
 * 负责Entity和VO之间的双向转换
 */

import { ChatMessage as ChatMessageEntity } from '../entities/agent/ChatMessage.entity';
import { ChatMessageVO } from '../cache-types/agent/vo/ChatMessage';
import { MessageRole, MessageType } from '../cache-types/agent/Enum/chatMessageTypeEnum';

export class ChatMessageMapper {
  /**
   * Entity转换为VO
   * 用于从数据库读取数据后传递给前端
   */
  static entityToVO(entity: ChatMessageEntity): ChatMessageVO {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      role: entity.role,
      type: entity.type || MessageType.TEXT,
      content: entity.content,
      toolCalls: entity.toolCalls,
      toolCallId: entity.toolCallId,
      model: entity.model,
      tokenCount: entity.tokenCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      timestamp: entity.createdAt, // 前端使用timestamp字段
      metadata: entity.metadata,
      error: entity.error,
      isDeleted: entity.isDeleted,
      // 前端特有字段，设置默认值
      attachments: [],
      isStreaming: false
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: ChatMessageVO): Partial<ChatMessageEntity> {
    return {
      id: vo.id,
      sessionId: vo.sessionId,
      role: vo.role,
      type: vo.type || MessageType.TEXT,
      content: vo.content,
      toolCalls: vo.toolCalls,
      toolCallId: vo.toolCallId,
      model: vo.model,
      tokenCount: vo.tokenCount,
      metadata: vo.metadata,
      error: vo.error,
      isDeleted: vo.isDeleted || false
      // 注意：不包含前端特有字段 attachments, isStreaming
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: ChatMessageEntity[]): ChatMessageVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: ChatMessageVO[]): Partial<ChatMessageEntity>[] {
    return vos.map(vo => this.voToEntity(vo));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新操作，保留Entity的数据库特有字段
   */
  static updateEntityFromVO(entity: ChatMessageEntity, vo: ChatMessageVO): ChatMessageEntity {
    // 只更新允许修改的字段
    entity.content = vo.content;
    entity.metadata = vo.metadata;
    entity.error = vo.error;
    entity.isDeleted = vo.isDeleted || false;
    
    // 不更新：id, sessionId, role, type, createdAt等关键字段
    return entity;
  }
}