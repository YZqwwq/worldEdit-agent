// 渲染层桥接模块：统一封装与主进程的 API 交互
// 仅暴露最小必要方法，避免业务服务直接依赖 window.api
import type { AIStructuredResponse } from '../../../share/cache/render/aiagent/aiContent'

export async function sendMessage(text: string): Promise<string> {
  return window.api.sendMessage(text)
}

// 新增结构化消息桥接：返回主进程的富结构片段数组
export async function sendMessageStructured(text: string): Promise<AIStructuredResponse> {
  return window.api.sendMessageStructured(text)
}
