import type { DataSource, EntityManager } from 'typeorm'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import type { MainAgentResumePoint } from './turnVersionSnapshot'
import type { MainAgentTurnVersionKind } from '@share/entity/database/MainAgentTurnVersionRecord'

export type MainAgentTurnVersionResumePoint = MainAgentResumePoint | 'commit_turn' | 'final'

export type PersistTurnVersionInput = {
  eventId: string
  turnId: number
  resumePoint: MainAgentTurnVersionResumePoint
  snapshotJson: string
  kind?: MainAgentTurnVersionKind
}

export const persistTurnVersion = async (
  dataSource: DataSource,
  input: PersistTurnVersionInput
): Promise<MainAgentTurnVersionRecord> =>
  dataSource.transaction(async (manager) => {
    const turnRepo = manager.getRepository(MainAgentTurnRecord)
    const versionRepo = manager.getRepository(MainAgentTurnVersionRecord)
    const turn = await turnRepo.findOneBy({ id: input.turnId })
    if (!turn) throw new Error(`Cannot version missing turn: ${input.turnId}`)
    if (turn.eventId !== input.eventId) {
      throw new Error(`Turn ${input.turnId} does not belong to event ${input.eventId}.`)
    }
    if (['completed', 'interrupted', 'cancelled', 'failed', 'reverted'].includes(turn.status)) {
      throw new Error(`Cannot version terminal turn ${input.turnId} (${turn.status}).`)
    }

    const latest = await versionRepo.findOne({
      where: { turnId: input.turnId },
      order: { sequence: 'DESC', id: 'DESC' }
    })
    const version = versionRepo.create({
      turnId: input.turnId,
      sequence: (latest?.sequence ?? 0) + 1,
      parentVersionId: turn.headVersionId ?? null,
      kind: input.kind ?? 'checkpoint',
      resumePoint: input.resumePoint,
      snapshotJson: input.snapshotJson
    })
    const saved = await versionRepo.save(version)
    turn.headVersionId = saved.id

    await turnRepo.save(turn)
    return saved
  })

export const persistFinalTurnVersionWithManager = async (
  manager: EntityManager,
  input: {
    turn: MainAgentTurnRecord
    snapshotJson: string
    reuseReadySnapshot?: boolean
  }
): Promise<MainAgentTurnVersionRecord> => {
  const versionRepo = manager.getRepository(MainAgentTurnVersionRecord)
  let currentHead: MainAgentTurnVersionRecord | null = null
  if (input.turn.headVersionId) {
    currentHead = await versionRepo.findOneBy({ id: input.turn.headVersionId })
    if (currentHead?.kind === 'final') return currentHead
  }
  const latest = await versionRepo.findOne({
    where: { turnId: input.turn.id },
    order: { sequence: 'DESC', id: 'DESC' }
  })
  const finalVersion = versionRepo.create({
    turnId: input.turn.id,
    sequence: (latest?.sequence ?? 0) + 1,
    parentVersionId: input.turn.headVersionId ?? null,
    kind: 'final',
    resumePoint: 'final',
    snapshotJson:
      input.reuseReadySnapshot !== false && currentHead?.kind === 'ready_to_commit'
        ? currentHead.snapshotJson
        : input.snapshotJson
  })
  return versionRepo.save(finalVersion)
}

export type CancelPausedTurnPersistenceResult = {
  turnId: number
  eventId: string
}

export const persistCancelledPausedTurn = async (
  dataSource: DataSource
): Promise<CancelPausedTurnPersistenceResult | null> =>
  dataSource.transaction(async (manager) => {
    const turnRepo = manager.getRepository(MainAgentTurnRecord)
    const eventRepo = manager.getRepository(MainAgentEventRecord)
    const versionRepo = manager.getRepository(MainAgentTurnVersionRecord)
    const turn = await turnRepo.findOne({
      where: { status: 'paused' },
      order: { createdAt: 'DESC', id: 'DESC' }
    })
    if (!turn) return null
    const event = await eventRepo.findOneBy({ id: turn.eventId })
    if (!event) throw new Error(`Cannot cancel paused turn ${turn.id} without its event.`)
    if (event.status !== 'paused') {
      throw new Error(
        `Cannot atomically cancel paused turn/event from ${turn.status}/${event.status}.`
      )
    }
    if (!turn.headVersionId) {
      throw new Error(`Cannot cancel paused turn ${turn.id} without a HEAD version.`)
    }
    const head = await versionRepo.findOneBy({ id: turn.headVersionId })
    if (!head) throw new Error(`Paused turn ${turn.id} points to a missing HEAD version.`)
    if (head.kind === 'final') {
      throw new Error(`Cannot cancel paused turn ${turn.id} from a Final Version.`)
    }

    const now = new Date()
    turn.status = 'cancelled'
    turn.cancelledAt = now
    turn.errorMessage = ''
    event.status = 'cancelled'
    event.summary = 'turn_cancelled'
    event.errorMessage = ''
    event.finishedAt = now
    await turnRepo.save(turn)
    await eventRepo.save(event)
    return { turnId: turn.id, eventId: event.id }
  })
