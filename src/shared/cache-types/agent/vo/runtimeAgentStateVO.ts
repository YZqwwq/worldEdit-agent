import { ConnectionStatus } from '../Enum'
import { TokenUsageVO } from './tokenUsageVO'

/**
 * 运行时代理状态值对象
 */
export interface RuntimeAgentStateVO {
  isConnected: boolean
  connectionStatus: ConnectionStatus
  currentModel?: string
  availableTools: string[]
  tokenUsage: TokenUsageVO
  lastActivity?: string
  error?: string
}