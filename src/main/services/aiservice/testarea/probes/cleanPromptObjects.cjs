const fs = require('node:fs')
const path = require('node:path')

const source = process.env.WORLDEDIT_AGENT_PROMPT_FILE
if (!source) throw new Error('Set WORLDEDIT_AGENT_PROMPT_FILE to prompt-clean-original.json')
const output = process.env.WORLDEDIT_AGENT_CLEAN_OUTPUT_FILE || path.join(path.dirname(source), 'prompt-clean-v2.json')
const raw = JSON.parse(fs.readFileSync(source, 'utf8'))
const messages = Array.isArray(raw) ? raw : raw.messages
if (!Array.isArray(messages) || messages.length === 0) throw new Error('Prompt file has no messages')

const marker = (content) => {
  const match = String(content).match(/｜([^｜]+)｜([^】]+)】/)
  return match ? match[2] : ''
}
const body = (content) => String(content)
  .replace(/^【[^\n]+】\n?/m, '')
  .replace(/^来源：[^\n]+\n?/m, '')
  .replace(/^时间：[^\n]+\n?/m, '')
  .replace(/^以下内容(?:是信息、感知、记忆或印象|说明本轮应遵循的理解、表达或行动规则|描述当前任务或工具执行状态)，?[^\n]*\n?/m, '')
  .trim()

const transformSystem = (message) => {
  const id = marker(message.content)
  const original = body(message.content)
  if (id === 'workspace-state') {
    return { ...message, content: original
      .replace(/页面快照时间：[^\n]+\n?/g, '')
      .replace(/，revision=\d+/g, '')
      .replace(/世界观：([^（\n]+)（worldId=([^）]+)）/, '世界观：$1（worldId=$2）')
      .replace(/当前文档：([^（\n]+)（documentId=([^，）]+)[^）]*）/, '当前文档：$1（documentId=$2）')
      .trim() }
  }
  if (id === 'workspace-rule') {
    return { ...message, content: '工作区页面是可靠的位置提示，但不等于用户正在讨论的语义焦点。需要操作当前文档时使用这里的文档标识；若用户明确谈论其他对象，以用户消息为准。' }
  }
  if (id === 'workspace-related-capabilities') {
    return { ...message, content: '按需关联能力：需要跨文档核对时激活 world_read；需要理解人物的多份叙事文本时激活 character_narrative_reader。不要因进入页面而机械激活工具集。' }
  }
  if (id === 'tool-usage') {
    return { ...message, content: [
      '工具使用规则：',
      '本地状态和外部事实优先用工具确认，不要猜测；参数使用用户语言或最近结果中的稳定标识，不要编造 ID。',
      '只读工具可以返回多个候选；写入、删除和委派必须先唯一定位目标。',
      '工具失败是可消费结果：根据错误信息、候选和建议调整调用或继续回答，不要直接中止。',
      '工具不足时先查询并激活合适的工具集；未激活的工具不可调用。',
      '只有 completion.state=completed 才表示 eventual 工具完成。'
    ].join('\n') }
  }
  if (id === 'expression-profile-catalog') return null
  if (id === 'agent-mind-context') {
    return { ...message, content: original.replace(/这些是动态背景[^\n]*\n?/g, '').trim() }
  }
  if (id === 'agent-cognitive-policy') {
    return { ...message, content: original.replace(/使用规则：[^\n]*\n?/g, '').trim() }
  }
  if (id === 'scene-character') {
    return { ...message, content: original.replace(/当前场景人格姿态：[^\n]+\n?/, '当前工作场景：文本编辑。\n').replace(/可选工作模式（[\s\S]*?）\n使用规则：/, '使用规则：').trim() }
  }
  return { ...message, content: original }
}

const beforeChars = messages.reduce((n, m) => n + String(m.content || '').length, 0)
const cleanedMessages = messages.map((message) => message.type === 'SystemMessage' ? transformSystem(message) : message).filter(Boolean)
const afterChars = cleanedMessages.reduce((n, m) => n + String(m.content || '').length, 0)
const result = { ...raw, variant: 'clean-v2', experimentNote: '保留原消息顺序和工具 transcript；仅清理每个系统对象的诊断包装、重复说明与表达专属上下文。', messages: cleanedMessages }
fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8')
console.log(JSON.stringify({ output, beforeMessages: messages.length, afterMessages: cleanedMessages.length, beforeChars, afterChars, saved: beforeChars - afterChars }, null, 2))
for (let i = 0; i < messages.length; i += 1) {
  const before = messages[i]
  const after = cleanedMessages.find((m) => m === before) || cleanedMessages[i]
  if (before.type === 'SystemMessage') console.log(`${i + 1}\t${marker(before.content)}\t${String(before.content).length}\t${after ? String(after.content).length : 0}`)
}
