import type {
  PromptInspectionPayload,
  PromptInspectionSection,
  SavePromptInspectionInput
} from '@share/cache/AItype/states/promptInspection'
import { getPromptRuntimeSnapshot } from './promptRuntimeSnapshotStore'
import { getPromptOverrides, savePromptOverrides } from './promptOverrideStore'

const EDITABLE_STATIC_IDS = new Set([
  'persona-anchor',
  'agent-habitat',
  'persona-cognition',
  'agent-habits',
  'relative-time-rule',
  'message-time-rule',
  'workspace-rule',
  'expression-profile-catalog',
  'reasoning-contract',
  'scene-character',
  'agent-cognitive-policy'
])

const RUNTIME_ID_TO_OVERRIDE_ID: Record<string, string> = {
  'turn-reasoning-contract': 'reasoning-contract'
}

const TITLES: Record<string, string> = {
  'persona-anchor': '人物设定',
  'agent-habitat': '长期生活环境',
  'agent-life-state': '主体生活状态',
  'current-event-narrative': '当下事件环境',
  'persona-cognition': '人物认知前提',
  'agent-habits': '交流习惯',
  'current-time': '当前时间',
  'relative-time-rule': '相对时间规则',
  'current-user-message-time': '当前用户消息时间',
  'message-time-rule': '消息时间规则',
  'workspace-state': '工作区状态',
  'workspace-rule': '工作区使用规则',
  'workspace-related-capabilities': '工作区关联能力',
  'active-task': '当前任务',
  'task-registration-status': '任务注册状态',
  'task-registration-blocked-rule': '任务注册限制规则',
  'task-lifecycle-notice': '任务生命周期提示',
  'task-delegation-rule': '任务委派规则',
  'tool-usage': '工具使用说明',
  'agent-mind-context': '当前心理背景',
  'expression-profile-catalog': '表达方式目录',
  'agent-cognitive-policy': '认知策略',
  'task-event-fact': '任务事件事实',
  'task-notification-event': '子 Agent 事件',
  'scene-character': '场景角色定位',
  'self-continuity': '跨轮主体连续性',
  'turn-reasoning-contract': '剧情推进方式',
  'cognition-draft-context': '本轮认知草稿',
  'empty-response-recovery': '空响应恢复规则',
  'tool-evidence': '工具证据',
  'tool-ephemeral-status': '工具执行结果'
}

const contentToText = (content: unknown): string =>
  typeof content === 'string' ? content : JSON.stringify(content, null, 2)

const parsePromptSection = (
  content: string
): { runtimeId: string; source: string; prefix: string; content: string } | null => {
  const lines = content.split('\n')
  const header = lines[0]?.match(/^【[^｜]+｜[^｜]+｜([^】]+)】$/)
  if (!header || lines.length < 3) return null
  return {
    runtimeId: header[1],
    source: lines[1]?.replace(/^来源：/, '').split('；')[0] || 'runtime',
    prefix: `${lines.slice(0, 3).join('\n')}\n`,
    content: lines.slice(3).join('\n')
  }
}

export const getPromptInspection = async (): Promise<PromptInspectionPayload> => {
  const snapshot = await getPromptRuntimeSnapshot()
  if (!snapshot) {
    return {
      generatedAt: new Date().toISOString(),
      hasRuntimeSnapshot: false,
      sections: [],
      fullText: ''
    }
  }

  const sections: PromptInspectionSection[] = snapshot.messages.map((message, messageIndex) => {
    const rawContent = contentToText(message.content)
    const parsed = parsePromptSection(rawContent)
    const runtimeId = parsed?.runtimeId
    const overrideId = runtimeId ? (RUNTIME_ID_TO_OVERRIDE_ID[runtimeId] ?? runtimeId) : ''
    const editable = Boolean(overrideId && EDITABLE_STATIC_IDS.has(overrideId))
    const messageDetails = [
      message.toolCallId ? `tool_call_id=${message.toolCallId}` : '',
      message.name ? `name=${message.name}` : '',
      message.toolCalls?.length ? `tool_calls=${JSON.stringify(message.toolCalls, null, 2)}` : ''
    ].filter(Boolean)
    const messagePrefix = [`消息 ${messageIndex + 1} · ${message.type}`, ...messageDetails].join(
      '\n'
    )

    return {
      id: overrideId || `runtime-message-${messageIndex + 1}`,
      title: runtimeId ? (TITLES[runtimeId] ?? runtimeId) : `${message.type} ${messageIndex + 1}`,
      category: editable ? 'static' : 'dynamic',
      source: parsed?.source ?? 'runtime-message',
      editable,
      messageType: message.type,
      messageIndex,
      prefix: `${messagePrefix}\n${parsed?.prefix ?? ''}`,
      content: parsed?.content ?? rawContent,
      mock: editable ? undefined : '本次认知调用的真实运行时内容，只读'
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    runtimeCapturedAt: snapshot.capturedAt,
    snapshotSource: snapshot.source,
    modelStep: snapshot.modelStep,
    model: snapshot.model,
    profile: snapshot.profile,
    hasRuntimeSnapshot: true,
    sections,
    fullText: sections.map((section) => `${section.prefix ?? ''}${section.content}`).join('\n\n')
  }
}

export const savePromptInspection = async (input: SavePromptInspectionInput): Promise<void> => {
  const overrides = await getPromptOverrides()
  for (const section of input.sections ?? []) {
    if (
      EDITABLE_STATIC_IDS.has(section.id) &&
      typeof section.content === 'string' &&
      section.content.trim()
    ) {
      overrides[section.id] = section.content
    }
  }
  await savePromptOverrides(overrides)
}
