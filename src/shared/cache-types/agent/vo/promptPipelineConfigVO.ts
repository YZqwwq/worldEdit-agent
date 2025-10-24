/**
 * 提示管道阶段值对象
 */
export interface PromptStageVO {
  name: string
  prompt: string
  variables?: Record<string, any>
}

/**
 * 提示管道配置值对象
 */
export interface PromptPipelineConfigVO {
  name: string
  description?: string
  stages: PromptStageVO[]
  variables?: Record<string, any>
}