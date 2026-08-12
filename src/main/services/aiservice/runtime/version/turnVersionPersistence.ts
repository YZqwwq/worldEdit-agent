import type { DataSource } from 'typeorm'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import type { MainAgentResumePoint } from './turnVersionSnapshot'

export type PersistTurnVersionInput = {
  eventId: string
  turnId: number
  resumePoint: MainAgentResumePoint
  snapshotJson: string
  pause: boolean
}

export const persistTurnVersion = async (
  dataSource: DataSource,
  input: PersistTurnVersionInput
): Promise<MainAgentTurnVersionRecord> =>
  dataSource.transaction(async (manager) => {
    const turnRepo = manager.getRepository(MainAgentTurnRecord)
    const eventRepo = manager.getRepository(MainAgentEventRecord)
    const versionRepo = manager.getRepository(MainAgentTurnVersionRecord)
    const turn = await turnRepo.findOneBy({ id: input.turnId })
    if (!turn) throw new Error(`Cannot version missing turn: ${input.turnId}`)
    if (turn.eventId !== input.eventId) {
      throw new Error(`Turn ${input.turnId} does not belong to event ${input.eventId}.`)
    }
    if (['completed', 'interrupted', 'failed', 'reverted'].includes(turn.status)) {
      throw new Error(`Cannot version terminal turn ${input.turnId} (${turn.status}).`)
    }

    const event = input.pause
      ? await eventRepo.findOneBy({ id: input.eventId })
      : null
    if (input.pause) {
      if (!event) throw new Error(`Cannot pause missing event: ${input.eventId}`)
      if (turn.status !== 'processing' || event.status !== 'processing') {
        throw new Error(
          `Cannot atomically pause turn/event from ${turn.status}/${event.status}.`
        )
      }
    }

    const latest = await versionRepo.findOne({
      where: { turnId: input.turnId },
      order: { sequence: 'DESC', id: 'DESC' }
    })
    const version = versionRepo.create({
      turnId: input.turnId,
      sequence: (latest?.sequence ?? 0) + 1,
      parentVersionId: turn.headVersionId ?? null,
      resumePoint: input.resumePoint,
      snapshotJson: input.snapshotJson
    })
    const saved = await versionRepo.save(version)
    turn.headVersionId = saved.id

    if (event) {
      turn.status = 'paused'
      turn.pausedAt = new Date()
      event.status = 'paused'
      event.summary = 'turn_paused'
      event.errorMessage = ''
      event.finishedAt = null
    }

    await turnRepo.save(turn)
    if (event) {
      await eventRepo.save(event)
    }
    return saved
  })
