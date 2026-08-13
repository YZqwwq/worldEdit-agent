import { AsyncLocalStorage } from 'node:async_hooks'
import { AppDataSource } from '../../../../database'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import type { MainAgentTurnVersionKind } from '@share/entity/database/MainAgentTurnVersionRecord'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import type {
  MainAgentGraphTurnResult,
  MainAgentReadyToCommitCandidate,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'
import {
  deserializeReadyToCommitCandidate,
  deserializeTurnGraphState,
  serializeReadyToCommitCandidate,
  serializeTurnGraphState,
  type MainAgentResumePoint
} from './turnVersionSnapshot'
import { persistTurnVersion } from './turnVersionPersistence'

type TurnVersionRuntimeContext = {
  eventId: string
  turnId: number
}

export type MainAgentRestorableHead =
  | {
      kind: 'checkpoint'
      state: Partial<typeof MessagesState.State>
    }
  | {
      kind: 'ready_to_commit'
      candidate: MainAgentReadyToCommitCandidate
    }

export type MainAgentStableInterruptionState = {
  sourceVersionId?: number
  resumePoint?: string
  workspace?: TurnWorkspace
}

class MainAgentTurnVersionService {
  private readonly runtime = new AsyncLocalStorage<TurnVersionRuntimeContext>()

  runInTurn<T>(context: TurnVersionRuntimeContext, operation: () => Promise<T>): Promise<T> {
    return this.runtime.run(context, operation)
  }

  async checkpointBeforeNode(
    resumePoint: MainAgentResumePoint,
    state: typeof MessagesState.State
  ): Promise<void> {
    const context = this.runtime.getStore()
    if (!context) return
    await persistTurnVersion(AppDataSource, {
      eventId: context.eventId,
      turnId: context.turnId,
      resumePoint,
      snapshotJson: serializeTurnGraphState(state)
    })
  }

  async checkpointAfterDurableToolEffect(
    state: typeof MessagesState.State
  ): Promise<void> {
    const context = this.runtime.getStore()
    if (!context) return
    await persistTurnVersion(AppDataSource, {
      eventId: context.eventId,
      turnId: context.turnId,
      resumePoint: 'toolContextReloadNode',
      snapshotJson: serializeTurnGraphState(state)
    })
  }

  async prepareReadyToCommit(graphResult: MainAgentGraphTurnResult): Promise<void> {
    const context = this.runtime.getStore()
    if (!context) {
      throw new Error('Cannot prepare a final candidate outside an active turn context.')
    }
    if (!graphResult.finalResponse?.content.trim()) {
      throw new Error('Cannot prepare a final candidate without a canonical response.')
    }
    if (
      graphResult.workspace.eventId !== context.eventId ||
      graphResult.workspace.turnId !== context.turnId
    ) {
      throw new Error('Final candidate workspace does not match the active turn.')
    }
    const candidate: MainAgentReadyToCommitCandidate = {
      schemaVersion: 1,
      eventId: context.eventId,
      turnId: context.turnId,
      sessionId: graphResult.workspace.sessionId,
      consumer: 'chat_runtime',
      status: 'completed',
      workspace: graphResult.workspace,
      finalResponse: graphResult.finalResponse
    }
    await persistTurnVersion(AppDataSource, {
      eventId: context.eventId,
      turnId: context.turnId,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(candidate)
    })
  }

  async getHeadKind(turnId: number): Promise<MainAgentTurnVersionKind | null> {
    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: turnId })
    if (!turn?.headVersionId) return null
    const head = await AppDataSource.getRepository(MainAgentTurnVersionRecord).findOneBy({
      id: turn.headVersionId
    })
    return head?.kind ?? null
  }

  async loadHead(turnId: number): Promise<MainAgentRestorableHead | null> {
    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: turnId })
    if (!turn?.headVersionId) return null
    const version = await AppDataSource.getRepository(MainAgentTurnVersionRecord).findOneBy({
      id: turn.headVersionId
    })
    if (!version) throw new Error(`Turn ${turnId} points to a missing HEAD version.`)
    if (version.kind === 'ready_to_commit') {
      return {
        kind: 'ready_to_commit',
        candidate: deserializeReadyToCommitCandidate(version.snapshotJson)
      }
    }
    if (version.kind !== 'checkpoint') {
      throw new Error(`Turn ${turnId} cannot resume from ${version.kind} HEAD.`)
    }
    return {
      kind: 'checkpoint',
      state: deserializeTurnGraphState(
        version.snapshotJson,
        version.resumePoint as MainAgentResumePoint
      )
    }
  }

  async loadStableInterruptionState(
    turnId: number
  ): Promise<MainAgentStableInterruptionState> {
    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: turnId })
    if (!turn?.headVersionId) return {}
    const version = await AppDataSource.getRepository(MainAgentTurnVersionRecord).findOneBy({
      id: turn.headVersionId
    })
    if (!version) throw new Error(`Turn ${turnId} points to a missing HEAD version.`)
    if (version.kind === 'ready_to_commit') {
      return {
        sourceVersionId: version.id,
        resumePoint: version.resumePoint,
        workspace: deserializeReadyToCommitCandidate(version.snapshotJson).workspace
      }
    }
    if (version.kind !== 'checkpoint') return {}
    const state = deserializeTurnGraphState(
      version.snapshotJson,
      version.resumePoint as MainAgentResumePoint
    )
    return {
      sourceVersionId: version.id,
      resumePoint: version.resumePoint,
      workspace: state.turnWorkspace
    }
  }

}

export const mainAgentTurnVersionService = new MainAgentTurnVersionService()
