/**
 * Token使用情况值对象
 */
export interface TokenUsageVO {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}