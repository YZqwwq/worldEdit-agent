/**
 * TokenUsage 数据转换器
 * 处理 TokenUsage Entity 和 TokenUsageVO 之间的双向转换
 */

import { TokenUsage as TokenUsageEntity, UsageType } from '../../../entities/agent/TokenUsage.entity';
import { TokenUsageVO } from '../vo/tokenUsageVO';

/**
 * 扩展的TokenUsageVO，包含更多字段用于完整的数据转换
 */
export interface ExtendedTokenUsageVO extends TokenUsageVO {
  id?: string;
  sessionId?: string;
  messageId?: string;
  model?: string;
  type?: string;
  currency?: string;
  responseTime?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
  provider?: string;
  endpoint?: string;
}

export class TokenUsageMapper {
  /**
   * Entity转换为VO
   * 用于从数据库读取数据后传递给前端
   */
  static entityToVO(entity: TokenUsageEntity): ExtendedTokenUsageVO {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      messageId: entity.messageId,
      model: entity.model,
      type: entity.type,
      promptTokens: entity.promptTokens,
      completionTokens: entity.completionTokens,
      totalTokens: entity.totalTokens,
      cost: entity.cost,
      currency: entity.currency,
      responseTime: entity.responseTime,
      timestamp: entity.createdAt.toISOString(),
      metadata: entity.metadata,
      provider: entity.provider,
      endpoint: entity.endpoint
    };
  }

  /**
   * Entity转换为基础VO（只包含核心字段）
   * 用于简单的token统计显示
   */
  static entityToBasicVO(entity: TokenUsageEntity): TokenUsageVO {
    return {
      promptTokens: entity.promptTokens,
      completionTokens: entity.completionTokens,
      totalTokens: entity.totalTokens,
      cost: entity.cost
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: ExtendedTokenUsageVO): Partial<TokenUsageEntity> {
    return {
      id: vo.id,
      sessionId: vo.sessionId || '',
      messageId: vo.messageId,
      model: vo.model || '',
      type: (vo.type as UsageType) || UsageType.TOTAL,
      promptTokens: vo.promptTokens,
      completionTokens: vo.completionTokens,
      totalTokens: vo.totalTokens,
      cost: vo.cost,
      currency: vo.currency,
      responseTime: vo.responseTime,
      metadata: vo.metadata,
      provider: vo.provider,
      endpoint: vo.endpoint
      // 注意：不包含 createdAt，这由数据库自动管理
    };
  }

  /**
   * 基础VO转换为Entity（用于简单创建）
   */
  static basicVOToEntity(vo: TokenUsageVO, sessionId: string, model: string): Partial<TokenUsageEntity> {
    return {
      sessionId,
      model,
      type: UsageType.TOTAL,
      promptTokens: vo.promptTokens,
      completionTokens: vo.completionTokens,
      totalTokens: vo.totalTokens,
      cost: vo.cost
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: TokenUsageEntity[]): ExtendedTokenUsageVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量Entity转基础VO
   */
  static entitiesToBasicVOs(entities: TokenUsageEntity[]): TokenUsageVO[] {
    return entities.map(entity => this.entityToBasicVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: ExtendedTokenUsageVO[]): Partial<TokenUsageEntity>[] {
    return vos.map(vo => this.voToEntity(vo));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新操作，保留Entity的数据库特有字段
   */
  static updateEntityFromVO(entity: TokenUsageEntity, vo: ExtendedTokenUsageVO): TokenUsageEntity {
    // TokenUsage通常是只读的，但允许更新一些字段
    entity.cost = vo.cost;
    entity.currency = vo.currency;
    entity.responseTime = vo.responseTime;
    entity.metadata = vo.metadata;
    entity.provider = vo.provider;
    entity.endpoint = vo.endpoint;
    
    // 不更新：id, sessionId, messageId, model, type, token相关字段, createdAt等关键字段
    return entity;
  }

  /**
   * 聚合多个TokenUsage为汇总VO
   * 用于会话或时间段的token使用统计
   */
  static aggregateToSummaryVO(entities: TokenUsageEntity[]): TokenUsageVO & { 
    count: number; 
    averageCost?: number; 
    averageResponseTime?: number;
  } {
    if (entities.length === 0) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        count: 0
      };
    }

    const summary = entities.reduce((acc, entity) => {
      acc.promptTokens += entity.promptTokens;
      acc.completionTokens += entity.completionTokens;
      acc.totalTokens += entity.totalTokens;
      acc.totalCost += entity.cost || 0;
      acc.totalResponseTime += entity.responseTime || 0;
      acc.validCostCount += entity.cost ? 1 : 0;
      acc.validResponseTimeCount += entity.responseTime ? 1 : 0;
      return acc;
    }, {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      totalResponseTime: 0,
      validCostCount: 0,
      validResponseTimeCount: 0
    });

    return {
      promptTokens: summary.promptTokens,
      completionTokens: summary.completionTokens,
      totalTokens: summary.totalTokens,
      cost: summary.totalCost,
      count: entities.length,
      averageCost: summary.validCostCount > 0 ? summary.totalCost / summary.validCostCount : undefined,
      averageResponseTime: summary.validResponseTimeCount > 0 ? summary.totalResponseTime / summary.validResponseTimeCount : undefined
    };
  }
}