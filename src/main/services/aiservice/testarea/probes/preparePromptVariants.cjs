const fs = require('node:fs')
const path = require('node:path')

const source = process.env.WORLDEDIT_AGENT_PROMPT_FILE
if (!source) throw new Error('Set WORLDEDIT_AGENT_PROMPT_FILE to cognition-prompt-step-3.json')
const outputDir = process.env.WORLDEDIT_AGENT_PROMPT_VARIANTS_DIR || path.dirname(source)
const raw = JSON.parse(fs.readFileSync(source, 'utf8'))
const messages = Array.isArray(raw) ? raw : raw.messages
if (!Array.isArray(messages) || messages.length === 0) throw new Error('Prompt file has no messages')

const systems = messages.filter((m) => m.type === 'SystemMessage')
const nonSystems = messages.filter((m) => m.type !== 'SystemMessage')
const byMarker = (marker) => systems.find((m) => String(m.content).includes(marker))
const currentUser = [...messages].reverse().find((m) => m.type === 'HumanMessage')
const previousConversation = messages.filter((m) => m.type === 'HumanMessage' || m.type === 'AIMessage')
const toolMessages = messages.filter((m) => m.type === 'ToolMessage')

const unique = (items) => items.filter((item, index) => item && items.indexOf(item) === index)
const write = (name, nextMessages, note) => {
  fs.mkdirSync(outputDir, { recursive: true })
  const output = {
    ...raw,
    variant: name,
    experimentNote: note,
    messages: nextMessages
  }
  const target = path.join(outputDir, `prompt-${name}.json`)
  fs.writeFileSync(target, JSON.stringify(output, null, 2), 'utf8')
  console.log(`${name}: ${nextMessages.length} messages, ${nextMessages.reduce((n, m) => n + String(m.content || '').length, 0)} chars -> ${target}`)
}

const identity = byMarker('【身份定义｜persona_anchor')
const habitat = byMarker('【身份定义｜existential_environment')
const lifeState = byMarker('【上下文信息｜agent_life_state')
const cognition = byMarker('【行为指令｜persona_cognition')
const habits = byMarker('【行为指令｜agent_habits')
const scene = byMarker('【行为指令｜scene_character_posture')
const contract = byMarker('【执行状态｜reasoning_contract')

write('baseline', messages, '原始捕获，不改动，仅作为对照。')

const cleanToolPayload = (message) => {
  if (message.type !== 'ToolMessage') return message
  let parsed
  try { parsed = JSON.parse(String(message.content)) } catch { return message }
  if (parsed.toolName === 'read_world_document') {
    const document = parsed.result && parsed.result.document
    return {
      ...message,
      content: document && typeof document.contentMarkdown === 'string'
        ? document.contentMarkdown
        : String(message.content)
    }
  }
  if (parsed.toolName === 'consult_thinking_guide') {
    const result = parsed.result || {}
    return {
      ...message,
      content: JSON.stringify({
        title: result.title,
        purpose: result.purpose,
        dimensions: result.dimensions,
        usageRules: result.usageRules
      }, null, 2)
    }
  }
  return message
}

write(
  'clean-original',
  messages.map(cleanToolPayload),
  '保持原始 25 条消息、顺序和全部系统 Prompt 不变；只移除 ToolMessage 中对模型无用的协议包装、数据库标识和文档结构元数据。'
)

write(
  'compact',
  unique([identity, habitat, lifeState, scene, contract, ...previousConversation, ...toolMessages]),
  '只保留身份、生活位置、当前场景、认知契约、对话和工具结果；移除时间规则、工作区规则、工具目录、表达方案等辅助上下文。'
)

write(
  'scene-after-tools',
  unique([identity, habitat, lifeState, contract, ...previousConversation, ...toolMessages, scene]),
  '让当前用户消息和外部工具结果先形成事件，再用场景姿态作为认知落点；其余辅助 system context 不参与。'
)

const projectedTools = toolMessages.map((message) => {
  let parsed
  try { parsed = JSON.parse(String(message.content)) } catch { return message }
  if (parsed.toolName === 'read_world_document') {
    const document = parsed.result && parsed.result.document
    return { ...message, content: JSON.stringify({ toolName: parsed.toolName, ok: parsed.ok, document: document ? { title: document.title, contentMarkdown: document.contentMarkdown } : null }, null, 2) }
  }
  if (parsed.toolName === 'consult_thinking_guide') {
    const result = parsed.result || {}
    return { ...message, content: JSON.stringify({ toolName: parsed.toolName, ok: parsed.ok, purpose: result.purpose, dimensions: result.dimensions, usageRules: result.usageRules }, null, 2) }
  }
  return message
})
write(
  'projected',
  unique([identity, habitat, lifeState, scene, contract, ...previousConversation, ...projectedTools]),
  '保留原始系统上下文，但将工具 envelope 投影为模型真正需要的事实正文和思考方向。'
)

const documentTool = projectedTools.find((message) => String(message.content).includes('read_world_document'))
let documentText = ''
try {
  documentText = JSON.parse(String(documentTool.content)).document.contentMarkdown
} catch {}
const material = {
  type: 'HumanMessage',
  content: `关于柯莱斯特·菲尔娜的人物文学资料：\n\n${documentText}`,
  additional_kwargs: { isExperimentMaterial: true }
}
const sceneMessage = (content) => ({
  type: 'SystemMessage',
  content,
  additional_kwargs: { isExperimentInstruction: true }
})

write(
  'reader-scene',
  [
    sceneMessage([
      '你需要写一段剧情。',
      '场景是：',
      '一个理性的读者正在阅读一段关于柯莱斯特·菲尔娜的人物文学资料。',
      '需要描写这位读者在阅读过程中思考菲尔娜这个人物时的复杂心理活动。（重点描写该读者的思考活动）'
    ].join('\n')),
    material
  ],
  '复现此前的理性读者剧情实验，只提供人物资料，不携带 Agent 问答协议。'
)

write(
  'famila-scene',
  [
    identity,
    habitat,
    lifeState,
    sceneMessage([
      '你需要续写一段正在发生的剧情。',
      '场景是：',
      '法弥拉正在 world-edit 中阅读关于柯莱斯特·菲尔娜的人物资料。用户刚刚问她怎么看这个人物。她还没有回复，正在形成自己的理解。',
      '需要描写法弥拉阅读资料时思考菲尔娜这个人物的复杂心理活动。（重点描写她尚未说出口的思考活动）'
    ].join('\n')),
    material
  ],
  '保留 Agent 身份和生活连续性，但用尚未开口的剧情位置激发认知。'
)

write(
  'first-person-thought',
  [
    identity,
    habitat,
    lifeState,
    sceneMessage([
      '当前真实事件是：用户问你怎么看柯莱斯特·菲尔娜。你已经读取了她的人物资料，此刻尚未向用户回复。',
      '继续记录你此刻真实形成的思考。'
    ].join('\n')),
    material
  ],
  '不用剧情写作格式，只给出主体位置和未开口状态，测试能否自然形成第一人称认知。'
)

const preSpeechScene = sceneMessage([
  '你需要续写一段发生在法弥拉内部的剧情。',
  '此刻，用户刚刚问她怎么看柯莱斯特·菲尔娜。她已经读取人物资料，正在形成自己的理解。',
  '剧情描写她此刻真实发生的内心活动，并停在她准备开口、但还没有向用户发出消息的位置。'
].join('\n'))

write(
  'pre-speech-full',
  [identity, habitat, lifeState, preSpeechScene, material],
  '保留完整身份与生活连续性，使用“停在开口前”作为唯一阶段边界。'
)

write(
  'pre-speech-light',
  [habitat, lifeState, preSpeechScene, material],
  '去掉长 persona anchor，只保留长期环境、上一刻生活状态和“停在开口前”的剧情。'
)
