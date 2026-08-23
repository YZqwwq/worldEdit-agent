import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getMainAgentContentPartsFromMessage, parseMainAgentContentForPersistence } from '../../../messagecontent/mainAgentMessageContentService'
import { contentToText } from '../../../messageoutput/transformRespones'
import { withMemoryMessagesDraft, withSelfExperienceDraft } from '../../state/turnWorkspace'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { buildSelfExperienceDraft } from '../../cognition/selfExperienceIntegration'

export async function memoryNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  if (!state.turnWorkspace) {
    throw new Error('memoryNode requires an initialized TurnWorkspace.')
  }

  const messages = state.messages
  
  // 策略：找到本轮对话中的 User 消息和 AI 消息并保存
  // 这里的假设是：memoryNode 在一轮对话的末尾运行
  
  const userMsg = state.turnInput?.source !== 'user'
    ? undefined
    : messages.slice().reverse().find(
        m => m instanceof HumanMessage && !m.additional_kwargs?.isHistory
      )
  const memoryMessages: Array<{ role: 'user' | 'ai'; content: string }> = []
  if (userMsg) {
    const userText = parseMainAgentContentForPersistence(getMainAgentContentPartsFromMessage(userMsg))
    if (userText) memoryMessages.push({ role: 'user', content: userText })
  }

  const aiMsg = messages.slice().reverse().find(
    m =>
      (m instanceof AIMessage || m.constructor.name === 'AIMessageChunk' || (m as any)._getType?.() === 'ai') &&
      !m.additional_kwargs?.isHistory
  )
  
  if (aiMsg) {
    const contentStr = state.finalResponse?.content ?? contentToText(aiMsg.content)
    if (contentStr) memoryMessages.push({ role: 'ai', content: contentStr })
  }

  const lifecycle = advanceTurnLifecycle(
    state.turnLifecycle ?? state.turnWorkspace.draft.lifecycle ?? {
      phase: 'expressing',
      revision: 0,
      updatedAt: new Date().toISOString()
    },
    'completed'
  )
  const workspaceWithMemory = withMemoryMessagesDraft(state.turnWorkspace, memoryMessages)
  const experience = buildSelfExperienceDraft({
    cognition: state.cognitiveState ?? state.turnWorkspace.draft.cognitiveState,
    orientation: state.responseOrientation ?? state.turnWorkspace.draft.responseOrientation,
    runtimeEvent: state.runtimeEvent
  })
  return {
    turnLifecycle: lifecycle,
    turnWorkspace: withTurnLifecycleDraft(
      withSelfExperienceDraft(workspaceWithMemory, experience),
      lifecycle
    )
  }
}
