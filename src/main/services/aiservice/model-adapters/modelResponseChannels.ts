import type { BaseMessage } from '@langchain/core/messages'

export type ModelResponseChannels = {
  reasoning: string
  content: string
}

const compactChannelText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const readContentBlocks = (content: BaseMessage['content']): ModelResponseChannels => {
  if (typeof content === 'string') return { reasoning: '', content: content.trim() }
  if (!Array.isArray(content)) return { reasoning: '', content: '' }
  const reasoning: string[] = []
  const visible: string[] = []
  for (const block of content as Array<Record<string, unknown>>) {
    const type = String(block?.type ?? '').toLowerCase()
    const text = compactChannelText(block?.text ?? block?.reasoning ?? block?.thinking)
    if (!text) continue
    if (type.includes('reason') || type.includes('thinking')) reasoning.push(text)
    else if (type === 'text' || !type) visible.push(text)
  }
  return { reasoning: reasoning.join('\n').trim(), content: visible.join('\n').trim() }
}

export const readDefaultResponseChannels = (response: BaseMessage): ModelResponseChannels => {
  const blocks = readContentBlocks(response.content)
  const additional = response.additional_kwargs as Record<string, unknown> | undefined
  const metadata = response.response_metadata as Record<string, unknown> | undefined
  const reasoning = [
    compactChannelText(additional?.reasoning_content), compactChannelText(additional?.reasoning),
    compactChannelText(metadata?.reasoning_content), compactChannelText(metadata?.reasoning),
    blocks.reasoning
  ].find(Boolean) ?? ''
  return { reasoning, content: blocks.content }
}
