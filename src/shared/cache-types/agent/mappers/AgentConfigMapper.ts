/**
 * AgentConfig 数据转换器
 * 处理 AgentConfig Entity 和 ServiceAgentConfigVO 之间的双向转换
 */

import { AgentConfig as AgentConfigEntity } from '../../../entities/agent/AgentConfig.entity';
import { ServiceAgentConfigVO } from '../vo/serviceAgentConfigVO';
import { ModelProvider } from '../Enum/modelEnum';

export class AgentConfigMapper {
  /**
   * Entity转换为VO
   * 用于从数据库读取数据后传递给前端
   */
  static entityToVO(entity: AgentConfigEntity): ServiceAgentConfigVO {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      provider: entity.provider,
      model: entity.modelName,
      apiKey: entity.apiKey,
      baseUrl: entity.baseURL,
      temperature: entity.temperature,
      maxTokens: entity.maxTokens,
      topP: entity.topP,
      frequencyPenalty: entity.frequencyPenalty,
      presencePenalty: entity.presencePenalty,
      stream: entity.stream,
      timeout: entity.timeout,
      maxRetries: entity.maxRetries,
      stop: entity.stop,
      systemPrompt: entity.systemPrompt,
      tools: entity.tools,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: ServiceAgentConfigVO): Partial<AgentConfigEntity> {
    return {
      id: vo.id,
      name: vo.name,
      description: vo.description,
      provider: vo.provider as ModelProvider,
      modelName: vo.model,
      apiKey: vo.apiKey || '',
      baseURL: vo.baseUrl,
      temperature: vo.temperature || 0.7,
      maxTokens: vo.maxTokens || 2000,
      topP: vo.topP || 0.9,
      frequencyPenalty: vo.frequencyPenalty || 0,
      presencePenalty: vo.presencePenalty || 0,
      stream: vo.stream || false,
      timeout: vo.timeout || 60000,
      maxRetries: vo.maxRetries || 3,
      retries: vo.maxRetries || 3, // Entity中的retries字段
      stop: vo.stop,
      systemPrompt: vo.systemPrompt || '',
      tools: vo.tools,
      isActive: vo.isActive
      // 注意：不包含 createdAt, updatedAt，这些由数据库自动管理
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: AgentConfigEntity[]): ServiceAgentConfigVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: ServiceAgentConfigVO[]): Partial<AgentConfigEntity>[] {
    return vos.map(vo => this.voToEntity(vo));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新操作，保留Entity的数据库特有字段
   */
  static updateEntityFromVO(entity: AgentConfigEntity, vo: ServiceAgentConfigVO): AgentConfigEntity {
    // 只更新允许修改的字段
    entity.name = vo.name;
    entity.description = vo.description;
    entity.provider = vo.provider as ModelProvider;
    entity.modelName = vo.model;
    entity.apiKey = vo.apiKey || '';
    entity.baseURL = vo.baseUrl;
    entity.temperature = vo.temperature || 0.7;
    entity.maxTokens = vo.maxTokens || 2000;
    entity.topP = vo.topP || 0.9;
    entity.frequencyPenalty = vo.frequencyPenalty || 0;
    entity.presencePenalty = vo.presencePenalty || 0;
    entity.stream = vo.stream || false;
    entity.timeout = vo.timeout || 60000;
    entity.maxRetries = vo.maxRetries || 3;
    entity.retries = vo.maxRetries || 3;
    entity.stop = vo.stop;
    entity.systemPrompt = vo.systemPrompt || '';
    entity.tools = vo.tools;
    entity.isActive = vo.isActive;
    
    // 不更新：id, createdAt等关键字段
    return entity;
  }

  /**
   * 轻量级VO转换（不包含敏感信息）
   * 用于列表显示等场景，隐藏API密钥等敏感信息
   */
  static entityToLightVO(entity: AgentConfigEntity): Omit<ServiceAgentConfigVO, 'apiKey'> {
    const vo = this.entityToVO(entity);
    const { apiKey, ...lightVO } = vo;
    return lightVO;
  }
}