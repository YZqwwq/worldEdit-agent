/**
 * 会话管理模块入口
 * 导出所有会话管理相关的服务和类型
 * 使用纯 TypeScript 实现，不依赖任何 Node.js 框架
 */

// 核心服务
export { SessionManager } from './SessionManager'
export { MessageSyncService } from './MessageSyncService'
export { EngineLifecycleManager } from './EngineLifecycleManager'
export { SessionConfigLoader } from './SessionConfigLoader'
export { ServiceContainer, serviceContainer, Injectable } from './ServiceContainer'

// 接口和类型
export {
  ISessionManager,
  IEngineLifecycleManager,
  IMessageSyncService,
  ISessionConfigLoader,
  ISessionEventListener,
  IServiceContainer,
  SessionCreateOptions,
  SessionFindOptions,
  SessionStats,
  EngineInstance,
  SessionEvent,
  SessionEventType,
  SessionStatus,
  SessionManagerConfig,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'