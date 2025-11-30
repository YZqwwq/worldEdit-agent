// 将主进程返回的富结构片段数组映射为 Markdown 字符串，供 md-editor-v3 使用
// 最小可用：支持 text / code / list / heading / blockquote / error / other
// 未识别类型以 other.json 代码块兜底，避免信息丢失
import type { AIContentPart } from '../../../share/cache/render/aiagent/aiContent'

const escapeTripleBackticks = (s: string): string => s.replace(/```/g, '~~~')

/**
 * 将富结构片段数组转换为 Markdown 字符串
 */
export function partsToMarkdown(parts: AIContentPart[]): string {
  const out: string[] = []
  for (const p of parts || []) {
    switch (p.type) {
      case 'text': {
        out.push(p.text || '')
        break
      }
      case 'code': {
        const lang = p.language || ''
        const code = String(p.code || '')
        out.push(`\n\`\`\`${lang}\n${escapeTripleBackticks(code)}\n\`\`\`\n`)
        break
      }
      case 'list': {
        const items = Array.isArray(p.items) ? p.items : []
        const ordered = !!p.ordered
        const lines = items.map((it: string, i: number) =>
          ordered ? `${i + 1}. ${String(it)}` : `- ${String(it)}`
        )
        out.push(lines.join('\n'))
        break
      }
      case 'heading': {
        const level = Math.min(Math.max(Number(p.level) || 2, 1), 6)
        const text = String(p.text || '')
        out.push(`${'#'.repeat(level)} ${text}`)
        break
      }
      case 'blockquote': {
        const text = String(p.text || '')
        const lines = text.split('\n').map((l) => `> ${l}`)
        out.push(lines.join('\n'))
        break
      }
      case 'error': {
        const msg = String(p.message || '未知错误')
        out.push(`> ⚠️ ${msg}`)
        break
      }
      case 'other': {
        out.push('```json\n' + (p.json || '') + '\n```')
        break
      }
      default: {
        // 理论上不会进入此分支（受限于 AIContentPart 联合类型）
        out.push('')
      }
    }
  }
  // 段落之间插入空行，提升可读性
  return out.filter(Boolean).join('\n\n')
}

/**
 * 可选：将整段 Markdown 包成引用块（仅在需要统一引用样式时使用）
 */
export function wrapMarkdownAsBlockquote(md: string): string {
  return (md || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}
