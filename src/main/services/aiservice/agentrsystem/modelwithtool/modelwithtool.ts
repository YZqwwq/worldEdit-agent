import type { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import { model } from './model'
import { tools } from './tool'
import { DynamicStructuredTool } from '@langchain/core/tools'

class ModelWithTool {
  model: ModelAdaptor
  tools: Record<string, DynamicStructuredTool>

  constructor(model: ModelAdaptor, toolsinput: Record<string, DynamicStructuredTool>) {
    this.model = model
    this.tools = toolsinput

    const toolsArray = Object.values(this.tools)
    this.model.bindTools(toolsArray)
  }

  getModel(): ModelAdaptor {
    return this.model
  }
}

export const modelWithTool = new ModelWithTool(model, tools).getModel()
