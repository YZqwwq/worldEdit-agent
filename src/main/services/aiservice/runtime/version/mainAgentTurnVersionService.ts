import { AsyncLocalStorage } from 'node:async_hooks'
import { AppDataSource } from '../../../../database'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import {
  deserializeTurnGraphState,
  readCompletedActionKeys,
  serializeTurnGraphState,
  type MainAgentResumePoint
} from './turnVersionSnapshot'
import { persistTurnVersion } from './turnVersionPersistence'

type TurnVersionRuntimeContext = {
  eventId: string
  turnId: number
}

export class MainAgentTurnPausedError extends Error {
  constructor() {
    super('Main agent turn paused at a stable boundary.')
    this.name = 'MainAgentTurnPausedError'
  }
}

export type TurnWorkspaceControlResult = {
  ok: boolean
  message: string
  turnId?: number
  versionId?: number
}

class MainAgentTurnVersionService {
  private readonly runtime = new AsyncLocalStorage<TurnVersionRuntimeContext>()
  private readonly pauseRequestedEventIds = new Set<string>()

  runInTurn<T>(context: TurnVersionRuntimeContext, operation: () => Promise<T>): Promise<T> {
    return this.runtime.run(context, operation)
  }

  requestPause(eventId: string): void {
    this.pauseRequestedEventIds.add(eventId)
  }

  clearPauseRequest(eventId: string): void {
    this.pauseRequestedEventIds.delete(eventId)
  }

  async checkpointBeforeNode(
    resumePoint: MainAgentResumePoint,
    state: typeof MessagesState.State
  ): Promise<void> {
    const context = this.runtime.getStore()
    if (!context) return
    const shouldPause = this.pauseRequestedEventIds.has(context.eventId)
    await persistTurnVersion(AppDataSource, {
      eventId: context.eventId,
      turnId: context.turnId,
      resumePoint,
      snapshotJson: serializeTurnGraphState(state),
      pause: shouldPause
    })
    if (shouldPause) {
      this.pauseRequestedEventIds.delete(context.eventId)
      throw new MainAgentTurnPausedError()
    }
  }

  async loadHeadState(turnId: number): Promise<Partial<typeof MessagesState.State> | null> {
    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: turnId })
    if (!turn?.headVersionId) return null
    const version = await AppDataSource.getRepository(MainAgentTurnVersionRecord).findOneBy({
      id: turn.headVersionId
    })
    if (!version) throw new Error(`Turn ${turnId} points to a missing HEAD version.`)
    return deserializeTurnGraphState(
      version.snapshotJson,
      version.resumePoint as MainAgentResumePoint
    )
  }

  async rollbackPausedTurn(): Promise<TurnWorkspaceControlResult> {
    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOne({
      where: { status: 'paused' },
      order: { createdAt: 'DESC', id: 'DESC' }
    })
    if (!turn?.headVersionId) {
      return { ok: false, message: '当前没有可回退的暂停工作区。' }
    }
    const repo = AppDataSource.getRepository(MainAgentTurnVersionRecord)
    const head = await repo.findOneBy({ id: turn.headVersionId })
    if (!head?.parentVersionId) {
      return { ok: false, message: '当前已经是本轮最早的稳定版本。', turnId: turn.id }
    }
    const parent = await repo.findOneBy({ id: head.parentVersionId })
    if (!parent) throw new Error('Turn version parent is missing.')
    const parentActions = new Set(readCompletedActionKeys(parent.snapshotJson))
    const discardedCompletedActions = readCompletedActionKeys(head.snapshotJson).filter(
      (key) => !parentActions.has(key)
    )
    if (discardedCompletedActions.length > 0) {
      return {
        ok: false,
        message: '该版本之后已经完成工具操作，第一阶段不会通过工作区回退伪装撤销外部结果。',
        turnId: turn.id,
        versionId: head.id
      }
    }
    turn.headVersionId = parent.id
    await AppDataSource.getRepository(MainAgentTurnRecord).save(turn)
    return {
      ok: true,
      message: `已回退到本轮稳定版本 ${parent.sequence}，尚未改变正式记忆或人格状态。`,
      turnId: turn.id,
      versionId: parent.id
    }
  }
}

export const mainAgentTurnVersionService = new MainAgentTurnVersionService()
