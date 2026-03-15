import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import { tools } from '../aiservice/agentrsystem/modelwithtool/tool'

type CapabilityInfo = {
  executorKind: TaskExecutorKind
  requiredToolName: string
  available: boolean
  message: string
}

const EXECUTOR_TOOL_MAP: Record<TaskExecutorKind, string> = {
  general_task_worker: 'delegate_general_task',
  code_worker: 'delegate_code_worker',
  doc_worker: 'delegate_doc_worker',
  tool_builder: 'delegate_tool_builder',
  architecture_analyst: 'delegate_architecture_analyst',
  general_research: 'delegate_general_research'
}

class SubAgentCapabilityService {
  getCapability(executorKind: TaskExecutorKind): CapabilityInfo {
    const requiredToolName = EXECUTOR_TOOL_MAP[executorKind]
    const available = Boolean(tools[requiredToolName])

    return {
      executorKind,
      requiredToolName,
      available,
      message: available
        ? `已找到对应的子 agent 工具：${requiredToolName}`
        : `当前缺少子 agent 能力工具「${requiredToolName}」，主代理不能注册该任务，请提示用户先加载对应能力工具。`
    }
  }
}

export const subAgentCapabilityService = new SubAgentCapabilityService()
