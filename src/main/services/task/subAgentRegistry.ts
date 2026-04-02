import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { TaskRecord } from '../../../share/entity/database/TaskRecord'
import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type {
  SubAgentOutcome,
  SubAgentProtocolDetails
} from '@share/cache/AItype/states/taskCommunication'
import {
  SUBAGENT_PROTOCOL_VERSION,
  buildSubAgentProtocolPayload,
  parseSubAgentProtocolPayload,
  type SubAgentProtocolPayload
} from '@share/cache/AItype/states/taskCommunication'
import { runCharacterEditorExecution } from '../aiservice/child-agent-system/characterEditorExecution'
import { modelConfigService } from '../modelconfig/modelConfigService'
import {
  continueCharacterEditorTask,
  type CharacterEditorContinuationResult
} from '../aiservice/child-agent-system/nodes/characterEditorContinuationNode'

export type SubAgentDispatchResult = {
  outcome: SubAgentOutcome
  summary: string
  userMessage: string
  pendingContext?: Record<string, unknown>
  details?: SubAgentProtocolDetails
  errorReport?: string
}

export type SubAgentDispatchHandler = (input: {
  task: TaskRecord
  execution: TaskExecutionRecord
  payload: Record<string, unknown>
}) => Promise<SubAgentDispatchResult>

export type SubAgentContinuationHandler = (input: {
  task: TaskRecord
  userReply: string
}) => Promise<CharacterEditorContinuationResult>

export type SubAgentTimeoutPolicy = {
  kind: 'model_config_child_agent_timeout'
  resolveTimeoutMs: () => Promise<number>
}

export type SubAgentRetryPolicy = {
  automaticRetry: boolean
  defaultRetryable: boolean
  maxAttempts: number
}

export type SubAgentProtocolAdapter = {
  version: typeof SUBAGENT_PROTOCOL_VERSION
  parsePayload: (
    input: unknown,
    fallback?: {
      outcome?: SubAgentOutcome
      summary?: string
      message?: string
    }
  ) => SubAgentProtocolPayload
  buildPayload: typeof buildSubAgentProtocolPayload
}

const defaultTimeoutPolicy: SubAgentTimeoutPolicy = {
  kind: 'model_config_child_agent_timeout',
  resolveTimeoutMs: () => modelConfigService.getChildAgentTimeoutMs()
}

const defaultRetryPolicy: SubAgentRetryPolicy = {
  automaticRetry: false,
  defaultRetryable: false,
  maxAttempts: 1
}

const defaultProtocolAdapter: SubAgentProtocolAdapter = {
  version: SUBAGENT_PROTOCOL_VERSION,
  parsePayload: parseSubAgentProtocolPayload,
  buildPayload: buildSubAgentProtocolPayload
}

const characterEditorDispatchHandler: SubAgentDispatchHandler = async ({ payload }) => {
  const timeoutMs = await defaultTimeoutPolicy.resolveTimeoutMs()
  const result = await runCharacterEditorExecution(payload, {
    timeoutMs
  })
  return {
    outcome: result.outcome,
    summary: result.summary,
    userMessage: result.message,
    pendingContext: result.pendingContext,
    details: result.details,
    errorReport: result.outcome === 'failed' ? result.message : undefined
  }
}

export type SubAgentRegistryEntry = {
  executorKind: TaskExecutorKind
  delegateToolName: string
  toolkitId: TaskExecutorKind
  enabled: boolean
  description: string
  dispatchHandler?: SubAgentDispatchHandler
  continuationHandler?: SubAgentContinuationHandler
  timeoutPolicy: SubAgentTimeoutPolicy
  retryPolicy: SubAgentRetryPolicy
  protocol: SubAgentProtocolAdapter
}

export const subAgentRegistry: Record<TaskExecutorKind, SubAgentRegistryEntry> = {
  general_task_worker: {
    executorKind: 'general_task_worker',
    delegateToolName: 'delegate_general_task',
    toolkitId: 'general_task_worker',
    enabled: false,
    description: '通用后台任务执行器，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  },
  code_worker: {
    executorKind: 'code_worker',
    delegateToolName: 'delegate_code_worker',
    toolkitId: 'code_worker',
    enabled: false,
    description: '代码执行子 agent，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  },
  doc_worker: {
    executorKind: 'doc_worker',
    delegateToolName: 'delegate_doc_worker',
    toolkitId: 'doc_worker',
    enabled: false,
    description: '文档执行子 agent，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  },
  character_editor: {
    executorKind: 'character_editor',
    delegateToolName: 'delegate_character_editor',
    toolkitId: 'character_editor',
    enabled: true,
    description: '人物描述编辑子 agent。',
    dispatchHandler: characterEditorDispatchHandler,
    continuationHandler: continueCharacterEditorTask,
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: {
      automaticRetry: false,
      defaultRetryable: false,
      maxAttempts: 1
    },
    protocol: defaultProtocolAdapter
  },
  tool_builder: {
    executorKind: 'tool_builder',
    delegateToolName: 'delegate_tool_builder',
    toolkitId: 'tool_builder',
    enabled: false,
    description: '工具构建子 agent，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  },
  architecture_analyst: {
    executorKind: 'architecture_analyst',
    delegateToolName: 'delegate_architecture_analyst',
    toolkitId: 'architecture_analyst',
    enabled: false,
    description: '架构分析子 agent，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  },
  general_research: {
    executorKind: 'general_research',
    delegateToolName: 'delegate_general_research',
    toolkitId: 'general_research',
    enabled: false,
    description: '通用研究子 agent，当前尚未接入。',
    timeoutPolicy: defaultTimeoutPolicy,
    retryPolicy: defaultRetryPolicy,
    protocol: defaultProtocolAdapter
  }
}

export const getSubAgentRuntimeSpec = (executorKind: TaskExecutorKind): SubAgentRegistryEntry =>
  subAgentRegistry[executorKind]
