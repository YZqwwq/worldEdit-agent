import { AppDataSource } from '../../database'
import { Message } from '../../../share/entity/database/Message'
import { taskNotificationService } from './taskNotificationService'
import { taskService } from './taskService'
import { taskExecutionService } from './taskExecutionService'
import {
  characterEditorPendingContextSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../aiservice/ai-utils/tools/character/shared'

type NotificationOrchestrationResult = {
  handled: boolean
  visibleMessage?: string
}

type UserReplyOrchestrationResult = {
  handled: boolean
  visibleMessage?: string
  executionId?: number
}

const CANCEL_PATTERNS = [/取消/, /结束/, /算了/, /不用了/, /先这样/, /停止/]

class TaskCoordinatorService {
  private get messageRepo() {
    return AppDataSource.getRepository(Message)
  }

  private async saveVisibleAiMessage(content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return

    const message = this.messageRepo.create({
      role: 'ai',
      content: trimmed,
      type: 'task_coordinator',
      sessionId: 'default'
    })
    await this.messageRepo.save(message)
  }

  async handlePublishedNotification(taskId: number): Promise<NotificationOrchestrationResult> {
    const consumed = await taskNotificationService.consumeNextPendingNotification(taskId)
    if (!consumed) {
      return { handled: false }
    }

    const visibleMessage = consumed.notice.message?.trim()
    if (visibleMessage) {
      await this.saveVisibleAiMessage(visibleMessage)
    }

    return {
      handled: true,
      visibleMessage
    }
  }

  async tryHandleUserReply(userInput: string): Promise<UserReplyOrchestrationResult> {
    const activeTask = await taskService.getActiveTask()
    if (!activeTask || activeTask.status !== 'awaiting_user_input') {
      return { handled: false }
    }

    if (CANCEL_PATTERNS.some((pattern) => pattern.test(userInput))) {
      return { handled: false }
    }

    if (activeTask.executorKind !== 'character_editor') {
      return { handled: false }
    }

    const pendingContextRaw = await taskService.getPendingContext(activeTask.id)
    const parsedPendingContext = characterEditorPendingContextSchema.safeParse(pendingContextRaw)
    if (!parsedPendingContext.success) {
      return { handled: false }
    }

    const pendingContext = parsedPendingContext.data
    const trimmedInput = userInput.trim()
    if (!trimmedInput) {
      return { handled: false }
    }

    const nextCharacterName =
      pendingContext.phase === 'resolve_character' && !pendingContext.targetCharacterName
        ? trimmedInput
        : pendingContext.targetCharacterName
    const nextWorldName =
      pendingContext.phase === 'resolve_world' ? trimmedInput : pendingContext.targetWorldName

    const queuedRun = await taskExecutionService.queueRun({
      taskId: activeTask.id,
      executorKind: activeTask.executorKind,
      inputPayload: {}
    })

    const nextPayload = delegateCharacterEditorTaskPayloadSchema.parse({
      taskId: activeTask.id,
      executionId: queuedRun.id,
      worldId: pendingContext.resolvedWorldId,
      worldName: nextWorldName,
      entityId: pendingContext.resolvedEntityId,
      characterName: nextCharacterName,
      userRequest: trimmedInput,
      originalUserRequest: pendingContext.originalUserRequest,
      editingScope: pendingContext.editingScope,
      editingDirection: pendingContext.editingDirection,
      expectedOutcome: pendingContext.expectedOutcome,
      source: pendingContext.source,
      pendingContext
    })

    await taskExecutionService.updateRunInputPayload(queuedRun.id, nextPayload)
    await taskService.setTaskStatus(activeTask.id, { status: 'running' })

    const visibleMessage =
      pendingContext.phase === 'resolve_world'
        ? `已收到世界观名称「${trimmedInput}」，我会继续让人物编辑子 agent 在后台处理中。`
        : pendingContext.phase === 'resolve_character'
          ? `已收到补充的人物信息「${trimmedInput}」，我会继续让人物编辑子 agent 在后台处理中。`
          : '已收到补充信息，我会继续让子 agent 在后台处理中。'

    return {
      handled: true,
      visibleMessage,
      executionId: queuedRun.id
    }
  }
}

export const taskCoordinatorService = new TaskCoordinatorService()
