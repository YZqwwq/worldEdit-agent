import type { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import { model } from './model'
import { tools } from './tool'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Runnable } from '@langchain/core/runnables'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'

function cleanSchema(schema: any): any {
  if (typeof schema !== 'object' || schema === null) return schema

  if (Array.isArray(schema)) {
    return schema.map(cleanSchema)
  }

  const newSchema = { ...schema }
  
  // Remove problematic keys that Gemini/Proxy might reject
  if ('additionalProperties' in newSchema) {
    delete newSchema.additionalProperties
  }
  // The error explicitly mentioned "schema" key being unknown in parameters
  if ('schema' in newSchema) {
    delete newSchema.schema
  }

  // Recursively clean properties
  for (const key in newSchema) {
    newSchema[key] = cleanSchema(newSchema[key])
  }

  return newSchema
}

class ModelWithTool {
  model: ModelAdaptor
  boundModel: Runnable
  tools: Record<string, DynamicStructuredTool>

  constructor(model: ModelAdaptor, toolsinput: Record<string, DynamicStructuredTool>) {
    this.model = model
    this.tools = toolsinput

    const toolsArray = Object.values(this.tools)
    
    // Pre-process tools to ensure compatibility with Gemini/Proxy
    const formattedTools = toolsArray.map(t => {
      const openAITool = convertToOpenAITool(t)
      if (openAITool.function && openAITool.function.parameters) {
        openAITool.function.parameters = cleanSchema(openAITool.function.parameters)
      }
      return openAITool
    })

    // bindTools returns a new Runnable, it does not mutate the model
    // We pass the formatted tools (raw objects) instead of DynamicStructuredTool instances
    this.boundModel = this.model.bindTools(formattedTools)
  }

  getModel(): Runnable {
    return this.boundModel
  }
}

export const modelWithTool = new ModelWithTool(model, tools).getModel()
