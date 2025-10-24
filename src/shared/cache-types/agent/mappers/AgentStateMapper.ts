/**
 * AgentState 数据转换器
 * 处理 AgentState Entity 和 RuntimeAgentStateVO 之间的双向转换
 */

import { AgentState as AgentStateEntity } from '../../../entities/agent/AgentState.entity';
import { RuntimeAgentStateVO } from '../vo/runtimeAgentStateVO';
import { TokenUsageVO } from '../vo/tokenUsageVO';
import { ConnectionStatus } from '../Enum/connectionStatusEnum';
import { AgentStatus } from '../Enum/agentStatusEnum';
import { AgentMode } from '../Enum/modelEnum';

export class AgentStateMapper {
  /**
   * Entity转换为VO
   * 用于从数据库读取数据后传递给前端
   */
  static entityToVO(entity: AgentStateEntity): RuntimeAgentStateVO {
    // 根据Agent状态判断连接状态
    const isConnected = entity.status === AgentStatus.IDLE || entity.status === AgentStatus.RUNNING;
    const connectionStatus = this.mapAgentStatusToConnectionStatus(entity.status);

    // 创建默认的TokenUsage（如果需要实际数据，应该从关联的TokenUsage实体获取）
    const defaultTokenUsage: TokenUsageVO = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
    };

    return {
      isConnected,
      connectionStatus,
      currentModel: entity.agentConfig?.modelName,
      availableTools: entity.toolStates ? Object.keys(entity.toolStates) : [],
      tokenUsage: defaultTokenUsage,
      lastActivity: entity.lastHeartbeat?.toISOString(),
      error: entity.lastError
    };
  }

  /**
   * VO转换为Entity（用于创建）
   * 用于前端数据保存到数据库
   */
  static voToEntity(vo: RuntimeAgentStateVO, agentConfigId: string): Partial<AgentStateEntity> {
    return {
      agentConfigId,
      status: this.mapConnectionStatusToAgentStatus(vo.connectionStatus),
      mode: AgentMode.CHAT, // 默认模式
      lastError: vo.error,
      lastHeartbeat: vo.lastActivity ? new Date(vo.lastActivity) : new Date(),
      isActive: vo.isConnected,
      // 工具状态可以根据availableTools设置
      toolStates: vo.availableTools.reduce((acc, tool) => {
        acc[tool] = { available: true };
        return acc;
      }, {} as Record<string, any>)
    };
  }

  /**
   * 批量Entity转VO
   */
  static entitiesToVOs(entities: AgentStateEntity[]): RuntimeAgentStateVO[] {
    return entities.map(entity => this.entityToVO(entity));
  }

  /**
   * 批量VO转Entity
   */
  static vosToEntities(vos: RuntimeAgentStateVO[], agentConfigId: string): Partial<AgentStateEntity>[] {
    return vos.map(vo => this.voToEntity(vo, agentConfigId));
  }

  /**
   * 更新Entity（合并VO数据到现有Entity）
   * 用于更新操作，保留Entity的数据库特有字段
   */
  static updateEntityFromVO(entity: AgentStateEntity, vo: RuntimeAgentStateVO): AgentStateEntity {
    // 只更新允许修改的字段
    entity.status = this.mapConnectionStatusToAgentStatus(vo.connectionStatus);
    entity.lastError = vo.error;
    entity.lastHeartbeat = vo.lastActivity ? new Date(vo.lastActivity) : new Date();
    entity.isActive = vo.isConnected;
    
    // 更新工具状态
    if (vo.availableTools.length > 0) {
      entity.toolStates = vo.availableTools.reduce((acc, tool) => {
        acc[tool] = { available: true };
        return acc;
      }, {} as Record<string, any>);
    }
    
    // 不更新：id, agentConfigId, createdAt等关键字段
    return entity;
  }

  /**
   * 将AgentStatus映射为ConnectionStatus
   */
  private static mapAgentStatusToConnectionStatus(status: AgentStatus): ConnectionStatus {
    switch (status) {
      case AgentStatus.IDLE:
      case AgentStatus.RUNNING:
        return ConnectionStatus.CONNECTED;
      case AgentStatus.ERROR:
        return ConnectionStatus.ERROR;
      case AgentStatus.IDLE:
      default:
        return ConnectionStatus.DISCONNECTED;
    }
  }

  /**
   * 将ConnectionStatus映射为AgentStatus
   */
  private static mapConnectionStatusToAgentStatus(status: ConnectionStatus): AgentStatus {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return AgentStatus.IDLE;
      case ConnectionStatus.ERROR:
        return AgentStatus.ERROR;
      case ConnectionStatus.DISCONNECTED:
      default:
        return AgentStatus.IDLE;
    }
  }

  /**
   * 创建简化的运行时状态VO（不包含TokenUsage详情）
   * 用于状态监控等轻量级场景
   */
  static entityToLightVO(entity: AgentStateEntity): Omit<RuntimeAgentStateVO, 'tokenUsage'> & { tokenUsage: Pick<TokenUsageVO, 'totalTokens'> } {
    const fullVO = this.entityToVO(entity);
    return {
      ...fullVO,
      tokenUsage: {
        totalTokens: fullVO.tokenUsage.totalTokens
      }
    };
  }
}