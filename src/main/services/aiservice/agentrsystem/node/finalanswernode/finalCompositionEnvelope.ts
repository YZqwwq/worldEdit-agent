export const parseFinalCompositionEnvelope = (
  content: string
): { reply: string; committedLifeNarrative: string } => {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectStart = normalized.indexOf('{')
  const objectEnd = normalized.lastIndexOf('}')
  const jsonCandidate =
    objectStart >= 0 && objectEnd > objectStart
      ? normalized.slice(objectStart, objectEnd + 1)
      : normalized
  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    if (typeof parsed.reply !== 'string') throw new Error('missing reply')
    return {
      reply: parsed.reply.trim(),
      committedLifeNarrative:
        typeof parsed.committedLifeNarrative === 'string'
          ? parsed.committedLifeNarrative.trim().slice(0, 4000)
          : ''
    }
  } catch {
    const replyMatch = jsonCandidate.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s)
    if (replyMatch) {
      try {
        return {
          reply: JSON.parse(`"${replyMatch[1]}"`) as string,
          committedLifeNarrative: ''
        }
      } catch {
        // Fall through to plain-text delivery.
      }
    }
    // 普通模型偶尔无法遵守信封格式时，优先保证用户仍能收到回答；
    // 生活状态不提交，避免把格式错误或面向用户的正文误当成主体历史。
    return { reply: content.trim(), committedLifeNarrative: '' }
  }
}
