/**
 * ToolCall 数据转换器
 * 处理 ToolCall Entity 和 ToolCallVO 之间的双向转换
 */

import { ToolCall as ToolCallEntity, ToolCallStatus, ToolType } from '../../../entities/agent/ToolCall.entity';
import { ToolCallVO } from '../vo/toolCallVO';

/**
 * 扩展的ToolCallVO，包含更多字段用于完整的数据转换
 */
export interface ExtendedToolCallVO extends ToolCallVO {
  callId?: string;
  sessionId?: string;
  messageId?: string;
  toolName?: string;
  toolType?: string;
  parameters?: Record<string, any>;
  result?: any;
  status?: string;
  error?: string;
  executionTime?: number;
  retryCount?: number;
  maxRetries?: number;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, any>;
  parentCallId?: string;
  isAsync?: boolean;
}

export class ToolCallMapper {
  /**
   * Entity转换为VO（标准格式）
   * 用于与AI模型交互的标准工具调用格式
   */
  static entityToVO(entity: ToolCallEntity): ToolCallVO {
    return {
      id: entity.callId, // 使用callId作为标准格式的id
      type: 'function', // 标准格式固定为function
      function: {
        name: entity.toolName,
        arguments: JSON.stringify(entity.parameters)
      }
    };
  }

  /**
   * Entity转换为扩展VO
   * 用于前端显示完整的工具调用信息
   */
  static entityToExtendedVO(entity: ToolCallEntity): ExtendedToolCallVO {
    return {
      id: entity.callId,
      type: 'function',
      function: {
        name: entity.toolName,
        arguments: JSON.stringify(entity.parameters)
      },
      callId: entity.callId,
      sessionId: entity.sessionId,
      messageId: entity.messageId,
      toolName: entity.toolName,
      toolType: entity.toolType,
      parameters: entity.parameters,
      result: entity.result,
      status: entity.status,
      error: entity.error,
      executionTime: entity.executionTime,
      retryCount: entity.retryCount,
      maxRetries: entity.maxRetries,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      startedAt: entity.startedAt?.toISOString(),
      completedAt: entity.completedAt?.toISOString(),
      metadata: entity.metadata,
      parentCallId: entity.parentCallId,
      isAsync: entity.isAsync
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: ToolCallVO, sessionId: string, messageId?: string): Partial<ToolCallEntity> {
    let parameters: Record<string, any> = {};
    try {
      parameters = JSON.parse(vo.function.arguments);
    } catch (error) {
      console.warn('Failed to parse tool call arguments:', vo.function.arguments);
      parameters = { raw: vo.function.arguments };
    }

    return {
      callId: vo.id,
      sessionId,
      messageId,
      toolName: vo.function.name,
      toolType: ToolType.FUNCTION, // 默认为function类型
      parameters,
      status: ToolCallStatus.PENDING,
      maxRetries: 3,
      isAsync: false
      // 注意：不包含 id, createdAt, updatedAt，这些由数据库自动管理
    };
  }

  /**
   * 扩展VO转换为Entity（用于完整创建）
   */
  static extendedVOToEntity(vo: ExtendedToolCallVO): Partial<ToolCallEntity> {
    return {
      callId: vo.callId || vo.id,
      sessionId: vo.sessionId || '',
      messageId: vo.messageId,
      toolName: vo.toolName || vo.function.name,
      toolType: (vo.toolType as ToolType) || ToolType.FUNCTION,
      parameters: vo.parameters || (vo.function.arguments ? JSON.parse(vo.function.arguments) : {}),
      result: vo.result,
      status: (vo.status as ToolCallStatus) || ToolCallStatus.PENDING,
      error: vo.error,
      executionTime: vo.executionTime,
      retryCount: vo.retryCount || 0,
      maxRetries: vo.maxRetries || 3,
      startedAt: vo.startedAt ? new Date(vo.startedAt) : undefined,
      completedAt: vo.completedAt ? new Date(vo.completedAt) : undefined,
      metadata: vo.metadata,
      parentCallId: vo.parentCallId,
      isAsync: vo.isAsync || false
      // 注意：不包含 id, createdAt, updatedAt
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: ToolCallEntity[]): ToolCallVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量Entity转扩展VO
   */
  static entitiesToExtendedVOs(entities: ToolCallEntity[]): ExtendedToolCallVO[] {
    return entities.map(entity => this.entityToExtendedVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: ToolCallVO[], sessionId: string, messageId?: string): Partial<ToolCallEntity>[] {
    return vos.map(vo => this.voToEntity(vo, sessionId, messageId));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新工具调用状态和结果
   */
  static updateEntityFromVO(entity: ToolCallEntity, vo: ExtendedToolCallVO): ToolCallEntity {
    // 更新可变字段
    if (vo.result !== undefined) entity.result = vo.result;
    if (vo.status) entity.status = vo.status as ToolCallStatus;
    if (vo.error !== undefined) entity.error = vo.error;
    if (vo.executionTime !== undefined) entity.executionTime = vo.executionTime;
    if (vo.retryCount !== undefined) entity.retryCount = vo.retryCount;
    if (vo.maxRetries !== undefined) entity.maxRetries = vo.maxRetries;
    if (vo.startedAt) entity.startedAt = new Date(vo.startedAt);
    if (vo.completedAt) entity.completedAt = new Date(vo.completedAt);
    if (vo.metadata !== undefined) entity.metadata = vo.metadata;
    if (vo.isAsync !== undefined) entity.isAsync = vo.isAsync;

    // 不更新：id, callId, sessionId, messageId, toolName, toolType, parameters, createdAt等关键字段
    return entity;
  }

  /**
   * Entity转换为轻量级VO（只包含核心字段）
   * 用于性能优化场景
   */
  static entityToLightVO(entity: ToolCallEntity): Pick<ExtendedToolCallVO, 'id' | 'type' | 'function' | 'status' | 'error'> {
    return {
      id: entity.callId,
      type: 'function',
      function: {
        name: entity.toolName,
        arguments: JSON.stringify(entity.parameters)
      },
      status: entity.status,
      error: entity.error
    };
  }

  /**
   * 创建工具调用结果VO
   * 用于返回工具执行结果
   */
  static createResultVO(entity: ToolCallEntity): {
    id: string;
    result: any;
    status: string;
    error?: string;
    executionTime?: number;
  } {
    return {
      id: entity.callId,
      result: entity.result,
      status: entity.status,
      error: entity.error,
      executionTime: entity.executionTime
    };
  }

  /**
   * 检查工具调用是否完成
   */
  static isCompleted(entity: ToolCallEntity): boolean {
    return entity.status === ToolCallStatus.COMPLETED || 
           entity.status === ToolCallStatus.FAILED || 
           entity.status === ToolCallStatus.CANCELLED;
  }

  /**
   * 检查工具调用是否成功
   */
  static isSuccessful(entity: ToolCallEntity): boolean {
    return entity.status === ToolCallStatus.COMPLETED && !entity.error;
  }
}