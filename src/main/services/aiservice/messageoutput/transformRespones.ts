/* eslint-disable prettier/prettier */
import type { AIContentPart } from '../../../../share/cache/render/aiagent/aiContent'

// 将 Responses API 返回的 content 归一化为纯文本
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as unknown[])
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const typeVal = (part as { type?: string }).type
          if (typeVal === 'text') {
            const textVal = (part as { text?: string }).text
            if (typeof textVal === 'string') return textVal
          }
        }
        return ''
      })
      .join('')
  }
  return ''
}

// 归一化内容为统一“片段数组”的富结构格式
export function contentToParts(content: unknown): AIContentPart[] {
  const safeStringify = (v: unknown): string => {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }

  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (Array.isArray(content)) {
    return (content as unknown[]).map((part) => {
      if (typeof part === 'string') return { type: 'text', text: part }
      if (part && typeof part === 'object') {
        const typeVal = (part as { type?: string }).type
        switch (typeVal) {
          case 'text': {
            const textVal = (part as { text?: string }).text || ''
            return { type: 'text', text: textVal }
          }
          case 'code': {
            const code = (part as { code?: string }).code || ''
            const language = (part as { language?: string }).language
            return { type: 'code', code, language }
          }
          case 'list': {
            const items = (part as { items?: string[] }).items || []
            const ordered = (part as { ordered?: boolean }).ordered
            return { type: 'list', items, ordered }
          }
          case 'heading': {
            const text = (part as { text?: string }).text || ''
            const level = (part as { level?: number }).level
            return { type: 'heading', text, level }
          }
          case 'blockquote': {
            const text = (part as { text?: string }).text || ''
            return { type: 'blockquote', text }
          }
          case 'error': {
            const message = (part as { message?: string }).message || '未知错误'
            return { type: 'error', message }
          }
          default: {
            return { type: 'other', json: safeStringify(part) }
          }
        }
      }
      return { type: 'other', json: safeStringify(part) }
    })
  }
  return []
}
