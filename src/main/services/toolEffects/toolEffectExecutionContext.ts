import { AsyncLocalStorage } from 'node:async_hooks'
import type { ToolEffectRecoveryMode } from '@share/cache/AItype/states/toolEffect'

export type ToolEffectExecutionContext = {
  eventId: string
  turnId: number
  changeSetId: string
  sessionId: string
  toolCallId: string
  toolName: string
  recoveryMode: ToolEffectRecoveryMode
}

const storage = new AsyncLocalStorage<ToolEffectExecutionContext>()

export const runWithToolEffectExecutionContext = <T>(
  context: ToolEffectExecutionContext,
  execute: () => Promise<T>
): Promise<T> => storage.run(context, execute)

export const getToolEffectExecutionContext = (): ToolEffectExecutionContext | undefined =>
  storage.getStore()
