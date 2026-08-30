import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'
import { TaskExecutionRecord } from '@share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '@share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '@share/entity/database/TaskRecord'
import { TaskTraceRecord } from '@share/entity/database/TaskTraceRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import { AgentArtifactRecord } from '@share/entity/database/AgentArtifactRecord'
import { SelfExperienceRecord } from '@share/entity/database/SelfExperienceRecord'
import { ToolUsageStatsRecord } from '@share/entity/database/ToolUsageStatsRecord'
import { memoryManager } from '../agentrsystem/manager/memory/MemoryManager'
import { memorySlotService } from '../agentrsystem/manager/memory/memorySlotService'
import {
  resetPersonaSessionDynamics,
  resetPersonaState
} from '../agentrsystem/manager/personal/personalManager'
import { interactionObservationService } from '../agentrsystem/manager/personal/interactionObservationService'
import { chatMessageService } from '../chat/chatMessageService'
import { mainAgentDispatchService } from '../runtime/queue/mainAgentDispatchQueueService'
import { mainAgentRunControlService } from '../runtime/mainAgentRunControlService'
import { selfCoreAuthorityService } from '../agentrsystem/manager/selfmodel/selfCoreAuthorityService'
import { agentLifeStateService } from '../agentrsystem/manager/selfmodel/agentLifeStateService'
import { MemoryEntry } from '@share/entity/database/MemoryEntry'
import { MemoryStageRecord } from '@share/entity/database/MemoryStageRecord'
import { AgentLifeStateRecord } from '@share/entity/database/AgentLifeStateRecord'
import { PersonaStateRecord } from '@share/entity/database/PersonaStateRecord'
import { MemoryStateRecord } from '@share/entity/database/MemoryStateRecord'
import { MemorySlotRecord } from '@share/entity/database/MemorySlotRecord'
import { InteractionObservationRecord } from '@share/entity/database/InteractionObservationRecord'
import { SelfCoreRevisionRecord } from '@share/entity/database/SelfCoreRevisionRecord'
import { createDefaultMemorySlots } from '../agentrsystem/manager/memory/memoryWritePolicy'
import { createDefaultLongTermMemory } from '../agentrsystem/manager/memory/longTermMemoryService'

class AiSessionMaintenanceService {
  private async assertAgentSessionReset(): Promise<void> {
    const checks: Array<[string, number]> = [
      ['messages', await AppDataSource.getRepository(Message).count()],
      ['turns', await AppDataSource.getRepository(MainAgentTurnRecord).count()],
      ['turn versions', await AppDataSource.getRepository(MainAgentTurnVersionRecord).count()],
      ['events', await AppDataSource.getRepository(MainAgentEventRecord).count()],
      ['tasks', await AppDataSource.getRepository(TaskRecord).count()],
      ['task executions', await AppDataSource.getRepository(TaskExecutionRecord).count()],
      ['task notifications', await AppDataSource.getRepository(TaskNotificationRecord).count()],
      ['task traces', await AppDataSource.getRepository(TaskTraceRecord).count()],
      ['memory entries', await AppDataSource.getRepository(MemoryEntry).count()],
      ['memory stages', await AppDataSource.getRepository(MemoryStageRecord).count()],
      ['artifacts', await AppDataSource.getRepository(AgentArtifactRecord).count()],
      ['self experiences', await AppDataSource.getRepository(SelfExperienceRecord).count()],
      ['tool usage stats', await AppDataSource.getRepository(ToolUsageStatsRecord).count()],
      ['self core revisions', await AppDataSource.getRepository(SelfCoreRevisionRecord).count()],
      ['interaction observations', await AppDataSource.getRepository(InteractionObservationRecord).count()]
    ]
    const leftovers = checks.filter(([, count]) => count > 0)
    const lifeState = await AppDataSource.getRepository(AgentLifeStateRecord).findOneBy({ id: 1 })
    const persona = await AppDataSource.getRepository(PersonaStateRecord).findOneBy({ id: 1 })
    const memoryState = await AppDataSource.getRepository(MemoryStateRecord).findOneBy({ id: 1 })
    const memorySlot = await AppDataSource.getRepository(MemorySlotRecord).findOneBy({ id: 1 })
    if (lifeState?.narrative?.trim() || lifeState?.revision !== 0 || lifeState?.sourceTurnId !== null) {
      leftovers.push(['agent life state', 1])
    }
    if (persona && (persona.lastObservationId !== 0 || persona.evolutionTurn !== 0)) {
      leftovers.push(['persona session cursor', 1])
    }
    if (memoryState) {
      let longTermDirty = true
      let archiveBufferDirty = true
      try {
        longTermDirty =
          JSON.stringify(JSON.parse(memoryState.longTermJson || '{}')) !==
          JSON.stringify(createDefaultLongTermMemory())
        archiveBufferDirty =
          JSON.stringify(JSON.parse(memoryState.archiveBufferJson || '[]')) !== '[]'
      } catch {
        longTermDirty = true
        archiveBufferDirty = true
      }
      const hasMemory =
        memoryState.totalTurns !== 0 ||
        memoryState.windowTurns !== 0 ||
        memoryState.sinceLastArchive !== 0 ||
        memoryState.lastStageIndex !== 0 ||
        archiveBufferDirty ||
        longTermDirty
      if (hasMemory) leftovers.push(['memory state', 1])
    }
    if (memorySlot) {
      let memorySlotsDirty = memorySlot.lastObservationId !== 0
      try {
        memorySlotsDirty ||= JSON.stringify(JSON.parse(memorySlot.payloadJson)) !== JSON.stringify(createDefaultMemorySlots())
      } catch {
        memorySlotsDirty = true
      }
      if (memorySlotsDirty) leftovers.push(['memory slots', 1])
    }
    if (leftovers.length) {
      throw new Error(
        `Agent session reset verification failed: ${leftovers
          .map(([name, count]) => `${name}=${count}`)
          .join(', ')}`
      )
    }
  }

  async clearHistory(): Promise<void> {
    const idle = await mainAgentRunControlService.abortAndWaitForIdle()
    if (!idle) {
      throw new Error(
        'Main agent is still running; clearHistory was refused to avoid inconsistent cleanup.'
      )
    }
    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await chatMessageService.clearAll()
    await AppDataSource.getRepository(AgentArtifactRecord).clear()
    await AppDataSource.getRepository(SelfExperienceRecord).clear()
    selfCoreAuthorityService.invalidateIntegrityAudit()
    await AppDataSource.getRepository(MainAgentEventRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnVersionRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnRecord).clear()
    await memoryManager.resetStorage()
    await memorySlotService.clear()
    await interactionObservationService.clear()
    await resetPersonaSessionDynamics()
    await agentLifeStateService.reset()
  }

  async resetAgentSession(): Promise<void> {
    const idle = await mainAgentRunControlService.abortAndWaitForIdle()
    if (!idle) {
      throw new Error(
        'Main agent is still running; resetAgentSession was refused to avoid inconsistent cleanup.'
      )
    }
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(TaskTraceRecord).clear()
      await manager.getRepository(TaskNotificationRecord).clear()
      await manager.getRepository(TaskExecutionRecord).clear()
      await manager.getRepository(TaskRecord).clear()
      await manager.getRepository(ToolUsageStatsRecord).clear()
      await manager.getRepository(InteractionObservationRecord).clear()
      await manager.getRepository(AgentArtifactRecord).clear()
      await manager.getRepository(SelfExperienceRecord).clear()
      await selfCoreAuthorityService.clear(manager)
      await agentLifeStateService.resetWithManager(manager)
      await manager.getRepository(MainAgentEventRecord).clear()
      await manager.getRepository(MainAgentTurnVersionRecord).clear()
      await manager.getRepository(MainAgentTurnRecord).clear()
      await manager.getRepository(Message).clear()
    })

    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await memoryManager.resetStorage()
    await memorySlotService.clear()
    await resetPersonaState()
    await this.assertAgentSessionReset()
  }

  async resetPersonaStateOnly(): Promise<void> {
    await resetPersonaState()
  }

  async resetAgentState(): Promise<void> {
    const idle = await mainAgentRunControlService.abortAndWaitForIdle()
    if (!idle) {
      throw new Error(
        'Main agent is still running; resetAgentState was refused to avoid inconsistent cleanup.'
      )
    }

    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await chatMessageService.clearAll()
    await AppDataSource.getRepository(AgentArtifactRecord).clear()
    await AppDataSource.getRepository(SelfExperienceRecord).clear()
    await selfCoreAuthorityService.clear()
    await AppDataSource.getRepository(MainAgentEventRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnVersionRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnRecord).clear()
    await memoryManager.resetStorage()
    await memorySlotService.clear()
    await interactionObservationService.clear()
    await resetPersonaState()
    await agentLifeStateService.reset()
  }
}

export const aiSessionMaintenanceService = new AiSessionMaintenanceService()
