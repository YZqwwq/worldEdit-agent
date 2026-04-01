import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'

export type SubAgentRegistryEntry = {
  executorKind: TaskExecutorKind
  delegateToolName: string
  toolkitId: TaskExecutorKind
  enabled: boolean
  description: string
}

export const subAgentRegistry: Record<TaskExecutorKind, SubAgentRegistryEntry> = {
  general_task_worker: {
    executorKind: 'general_task_worker',
    delegateToolName: 'delegate_general_task',
    toolkitId: 'general_task_worker',
    enabled: false,
    description: '通用后台任务执行器，当前尚未接入。'
  },
  code_worker: {
    executorKind: 'code_worker',
    delegateToolName: 'delegate_code_worker',
    toolkitId: 'code_worker',
    enabled: false,
    description: '代码执行子 agent，当前尚未接入。'
  },
  doc_worker: {
    executorKind: 'doc_worker',
    delegateToolName: 'delegate_doc_worker',
    toolkitId: 'doc_worker',
    enabled: false,
    description: '文档执行子 agent，当前尚未接入。'
  },
  character_editor: {
    executorKind: 'character_editor',
    delegateToolName: 'delegate_character_editor',
    toolkitId: 'character_editor',
    enabled: true,
    description: '人物描述编辑子 agent。'
  },
  tool_builder: {
    executorKind: 'tool_builder',
    delegateToolName: 'delegate_tool_builder',
    toolkitId: 'tool_builder',
    enabled: false,
    description: '工具构建子 agent，当前尚未接入。'
  },
  architecture_analyst: {
    executorKind: 'architecture_analyst',
    delegateToolName: 'delegate_architecture_analyst',
    toolkitId: 'architecture_analyst',
    enabled: false,
    description: '架构分析子 agent，当前尚未接入。'
  },
  general_research: {
    executorKind: 'general_research',
    delegateToolName: 'delegate_general_research',
    toolkitId: 'general_research',
    enabled: false,
    description: '通用研究子 agent，当前尚未接入。'
  }
}

