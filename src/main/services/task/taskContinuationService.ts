import { taskService } from './taskService'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema
} from '../aiservice/ai-utils/tools/character/shared'
import { continueActiveChildAgentOutputSchema } from '../aiservice/ai-utils/tools/task/shared'
import * as z from 'zod'
import { subAgentRegistry } from './subAgentRegistry'
import { awaitingUserInputNode } from '../aiservice/runtime/lifecycle/nodes/awaitingUserInputNode'

type CharacterEditorStartInput = z.infer<typeof delegateCharacterEditorInputSchema>
type CharacterEditorStartResult = z.infer<typeof delegateCharacterEditorOutputSchema>
type ContinueActiveChildAgentResult = z.infer<typeof continueActiveChildAgentOutputSchema>

class TaskContinuationService {
  async startCharacterEditorTask(input: CharacterEditorStartInput): Promise<CharacterEditorStartResult> {
    const parsedInput = delegateCharacterEditorInputSchema.parse(input)
    const handler = subAgentRegistry.character_editor.startHandler
    if (!handler) {
      throw new Error('character_editor does not have a registered start handler.')
    }
    const result = await handler(parsedInput)
    return delegateCharacterEditorOutputSchema.parse(result)
  }

  async continueActiveTask(
    userReply: string,
    options?: { skipIntentCheck?: boolean }
  ): Promise<ContinueActiveChildAgentResult> {
    const activeTask = await taskService.getActiveTask()
    if (!activeTask || activeTask.status !== 'awaiting_user_input') {
      throw new Error('No active child-agent task is currently waiting for user input.')
    }

    if (!options?.skipIntentCheck) {
      const pendingContext = await taskService.getPendingContext(activeTask.id)
      const decision = await awaitingUserInputNode.resolve({
        userInput: userReply,
        activeTask: {
          id: activeTask.id,
          title: activeTask.title,
          status: activeTask.status,
          executorKind: activeTask.executorKind
        },
        pendingContext
      })

      if (decision.type === 'cancel_task') {
        throw new Error('The latest user reply looks like a cancellation request, not continuation input.')
      }
      if (decision.type === 'ask_status') {
        throw new Error('The latest user reply is asking about task status, not supplying continuation input.')
      }
      if (decision.type !== 'continue_task') {
        throw new Error('The latest user reply does not yet provide enough information to safely resume the child-agent task.')
      }
    }

    const handler = subAgentRegistry[activeTask.executorKind].continuationHandler
    if (!handler) {
      throw new Error(
        `Current active task #${activeTask.id} does not have a registered continuation handler for ${activeTask.executorKind}.`
      )
    }

    const result = await handler({
      task: activeTask,
      userReply
    })

    return continueActiveChildAgentOutputSchema.parse({
      accepted: true,
      taskId: result.taskId,
      executionId: result.executionId,
      executorKind: activeTask.executorKind,
      status: 'running',
      summary: result.summary,
      nextAction: 'await_subagent_result'
    })
  }
}

export const taskContinuationService = new TaskContinuationService()
