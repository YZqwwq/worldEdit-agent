// 渲染层桥接模块：统一封装与主进程的 API 交互
// 仅暴露最小必要方法，避免业务服务直接依赖 window.api
import type { AIStructuredResponse } from '../../../share/cache/render/aiagent/aiContent'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'

// 模拟一次性请求：通过流式接口收集数据
export async function sendMessage(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullText = ''
    
    // 监听流式数据
    const off = window.api.onStreamChunk((chunk: StreamChunk) => {
      if (chunk.type === 'text_delta') {
        fullText += chunk.content
      } else if (chunk.type === 'done') {
        off() // 移除监听
        resolve(fullText)
      } else if (chunk.type === 'stream_error') {
        off()
        reject(new Error(chunk.message))
      }
    })

    // 发送消息
    window.api.sendMessageStream(text)
  })
}

// 结构化消息桥接：同样通过流式接口收集 done 事件中的 fullContent
export async function sendMessageStructured(text: string): Promise<AIStructuredResponse> {
  return new Promise((resolve, reject) => {
    const off = window.api.onStreamChunk((chunk: StreamChunk) => {
      if (chunk.type === 'done') {
        off()
        resolve(chunk.fullContent)
      } else if (chunk.type === 'stream_error') {
        off()
        reject(new Error(chunk.message))
      }
    })

    window.api.sendMessageStream(text)
  })
}

// 暴露流式接口
export function sendMessageStream(text: string): void {
  window.api.sendMessageStream(text)
}

export function onStreamChunk(callback: (chunk: StreamChunk) => void): () => void {
  return window.api.onStreamChunk(callback)
}

export async function getHistory(): Promise<any[]> {
  return window.api.getHistory()
}

export async function clearHistory(): Promise<void> {
  return window.api.clearHistory()
}
