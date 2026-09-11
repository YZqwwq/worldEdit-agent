export const extractCognitionHandoff = (text: string): string | undefined => {
  const offset = text.lastIndexOf('主线结果：')
  if (offset < 0) return undefined
  const handoff = text.slice(offset).trim()
  if (handoff.length > 4800) return undefined
  const main = handoff.indexOf('主线结果：')
  const candidates = handoff.indexOf('候选方向：')
  if (main < 0 || candidates <= main) return undefined
  if (!handoff.slice(main + '主线结果：'.length, candidates).trim()) return undefined
  if (!handoff.slice(candidates + '候选方向：'.length).trim()) return undefined
  return handoff
}
