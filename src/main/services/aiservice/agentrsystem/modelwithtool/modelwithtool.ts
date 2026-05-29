import { DynamicStructuredTool } from '@langchain/core/tools'
import { Runnable } from '@langchain/core/runnables'
import {
  getMainAgentTools,
  resolveMainAgentToolActivationState
} from '../../ai-utils/toolkits/mainAgentToolRegistry'
import type { ToolActivationState } from '../../ai-utils/toolkits/toolRegistryTypes'
import {
  normalizeModelResponse,
  type ConfiguredModelRuntime
} from '../../model-adapters/modelProviderAdapter'
import { getConfiguredModelRuntime } from './model'

class ModelWithTool {
  runtime: ConfiguredModelRuntime
  boundModel: Runnable
  tools: Record<string, DynamicStructuredTool>

  constructor(runtime: ConfiguredModelRuntime, toolsinput: Record<string, DynamicStructuredTool>) {
    this.runtime = runtime
    this.tools = toolsinput

    const toolsArray = Object.values(this.tools)
    const formattedTools = this.runtime.familyAdapter.formatTools(toolsArray)
    this.boundModel = this.runtime.model.bindTools(formattedTools as any)
  }

  getModel(): Runnable {
    return this.boundModel
  }
}

export function bindToolsToModel(
  runtime: ConfiguredModelRuntime,
  toolRegistry: Record<string, DynamicStructuredTool>
): Runnable {
  return new ModelWithTool(runtime, toolRegistry).getModel()
}

export async function getModelWithTool(state?: ToolActivationState): Promise<{
  runnable: Runnable
  runtime: ConfiguredModelRuntime
}> {
  const runtime = await getConfiguredModelRuntime()
  const resolvedState = await resolveMainAgentToolActivationState(state)
  return {
    runnable: bindToolsToModel(runtime, getMainAgentTools(resolvedState)),
    runtime
  }
}

export { normalizeModelResponse }
