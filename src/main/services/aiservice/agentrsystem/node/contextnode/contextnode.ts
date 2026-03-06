import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../memory/MemoryManager'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

interface PersonaMetrics {
  autonomy_level: number
  verbosity_index: number
  risk_tolerance: number
  formality_score: number
}

interface PersonaBufferItem {
  turn: number
  user_signal: string
  impact: string
}

interface PersonaState {
  persona_id: string
  last_updated: string
  metrics: PersonaMetrics
  current_behavioral_narrative: string
  recent_interaction_buffer: PersonaBufferItem[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isString = (value: unknown): value is string => typeof value === 'string'

const parsePersonaState = (text: string): PersonaState | null => {
  const raw: unknown = JSON.parse(text)
  if (!isRecord(raw)) return null
  const metrics = raw.metrics
  const buffer = raw.recent_interaction_buffer
  if (!isRecord(metrics) || !Array.isArray(buffer)) return null
  if (
    !isString(raw.persona_id) ||
    !isString(raw.last_updated) ||
    !isString(raw.current_behavioral_narrative) ||
    !isNumber(metrics.autonomy_level) ||
    !isNumber(metrics.verbosity_index) ||
    !isNumber(metrics.risk_tolerance) ||
    !isNumber(metrics.formality_score)
  ) {
    return null
  }
  const parsedBuffer: PersonaBufferItem[] = []
  for (const item of buffer) {
    if (!isRecord(item)) return null
    if (!isNumber(item.turn) || !isString(item.user_signal) || !isString(item.impact)) return null
    parsedBuffer.push({ turn: item.turn, user_signal: item.user_signal, impact: item.impact })
  }
  return {
    persona_id: raw.persona_id,
    last_updated: raw.last_updated,
    metrics: {
      autonomy_level: metrics.autonomy_level,
      verbosity_index: metrics.verbosity_index,
      risk_tolerance: metrics.risk_tolerance,
      formality_score: metrics.formality_score
    },
    current_behavioral_narrative: raw.current_behavioral_narrative,
    recent_interaction_buffer: parsedBuffer
  }
}

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  _state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  
  const messages: BaseMessage[] = []

  // 1. 读取静态 Persona (法弥拉设定)
  try {
    const projectRoot = process.cwd()
    const rolePromptPath = join(projectRoot, 'src/main/prompt-resource/famila-daily/role/roleprompt.md')
    const persona = await readFile(rolePromptPath, 'utf-8')
    if (persona) {
        messages.push(new SystemMessage(persona))
    }
  } catch (error) {
    console.error('Failed to load role prompt:', error)
  }

  try {
    const projectRoot = process.cwd()
    const personaStatePath = join(projectRoot, 'src/main/prompt-resource/famila-daily/role/persona_state.json')
    const personaStateText = await readFile(personaStatePath, 'utf-8')
    const personaState = parsePersonaState(personaStateText)
    if (personaState) {
      const m = personaState.metrics
      const personaStatePrompt =
        `人格倾向状态:\n${personaState.current_behavioral_narrative}\n` +
        `metrics: autonomy_level=${m.autonomy_level}, verbosity_index=${m.verbosity_index}, ` +
        `risk_tolerance=${m.risk_tolerance}, formality_score=${m.formality_score}`
      messages.push(new SystemMessage(personaStatePrompt))
    }
  } catch (error) {
    console.error('Failed to load persona state:', error)
  }

  // 2. 获取 MemoryManager 上下文 (包含 Anchors 和 ShortTerm)
  const memoryMessages = memoryManager.getContext()
  
  // 3. 处理 Memory 消息并合并
  for (const msg of memoryMessages) {
    // 复制消息并添加 metadata
    if (msg instanceof HumanMessage) {
        messages.push(new HumanMessage({
            content: msg.content,
            additional_kwargs: { isHistory: true, ...msg.additional_kwargs }
        }))
    } else if (msg instanceof AIMessage) {
        messages.push(new AIMessage({
            content: msg.content,
            additional_kwargs: { isHistory: true, ...msg.additional_kwargs }
        }))
    } else if (msg instanceof SystemMessage) {
        // Anchors (系统提示词/用户目标)
        // 保持原样，llmCall 会将其置顶
        messages.push(msg)
    }
  }

  // 注意：LangGraph 的 reducer 通常是追加模式。
  // 最终顺序由 llmCall 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages
  }
}
