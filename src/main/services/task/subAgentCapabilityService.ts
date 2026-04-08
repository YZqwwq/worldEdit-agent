import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import { getToolsForMainAgent } from '../aiservice/ai-utils/toolkits/unifiedToolRegistry'
import { subAgentRegistry } from './subAgentRegistry'

type CapabilityInfo = {
  executorKind: TaskExecutorKind
  requiredToolName: string
  available: boolean
  message: string
}

class SubAgentCapabilityService {
  getCapability(executorKind: TaskExecutorKind): CapabilityInfo {
    const entry = subAgentRegistry[executorKind]
    const requiredToolName = entry.delegateToolName
    const tools = getToolsForMainAgent()
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
