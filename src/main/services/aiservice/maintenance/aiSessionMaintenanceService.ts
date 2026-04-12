import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'
import { TaskExecutionRecord } from '@share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '@share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '@share/entity/database/TaskRecord'
import { TaskTraceRecord } from '@share/entity/database/TaskTraceRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
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

class AiSessionMaintenanceService {
  async clearHistory(): Promise<void> {
    const idle = await mainAgentRunControlService.abortAndWaitForIdle()
    if (!idle) {
      throw new Error('Main agent is still running; clearHistory was refused to avoid inconsistent cleanup.')
    }
    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await chatMessageService.clearAll()
    await AppDataSource.getRepository(MainAgentEventRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnRecord).clear()
    await memoryManager.resetStorage()
    await memorySlotService.clear()
    await interactionObservationService.clear()
    await resetPersonaSessionDynamics()
  }

  async purgeAllData(): Promise<void> {
    const idle = await mainAgentRunControlService.abortAndWaitForIdle()
    if (!idle) {
      throw new Error('Main agent is still running; purgeAllData was refused to avoid inconsistent cleanup.')
    }
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(TaskTraceRecord).clear()
      await manager.getRepository(TaskNotificationRecord).clear()
      await manager.getRepository(TaskExecutionRecord).clear()
      await manager.getRepository(TaskRecord).clear()
      await manager.getRepository(MainAgentEventRecord).clear()
      await manager.getRepository(MainAgentTurnRecord).clear()
      await manager.getRepository(Message).clear()
    })

    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await memoryManager.resetStorage()
    await memorySlotService.clear()
    await interactionObservationService.clear()
    await resetPersonaState()
  }

  async resetPersonaStateOnly(): Promise<void> {
    await resetPersonaState()
  }
}

export const aiSessionMaintenanceService = new AiSessionMaintenanceService()
