import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'
import { TaskExecutionRecord } from '@share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '@share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '@share/entity/database/TaskRecord'
import { TaskTraceRecord } from '@share/entity/database/TaskTraceRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { memoryManager } from '../agentrsystem/manager/memory/MemoryManager'
import { resetPersonaState } from '../agentrsystem/manager/personal/personalManager'
import { chatMessageService } from '../chat/chatMessageService'
import { mainAgentDispatchService } from '../../middlelayer/event-in-wait/mainAgentDispatchService'
import { mainAgentRunControlService } from '../runtime/mainAgentRunControlService'

class AiSessionMaintenanceService {
  async clearHistory(): Promise<void> {
    mainAgentDispatchService.reset()
    mainAgentRunControlService.reset()
    await chatMessageService.clearAll()
    await AppDataSource.getRepository(MainAgentEventRecord).clear()
    await AppDataSource.getRepository(MainAgentTurnRecord).clear()
    await memoryManager.resetStorage()
  }

  async purgeAllData(): Promise<void> {
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
    await resetPersonaState()
  }

  async resetPersonaStateOnly(): Promise<void> {
    await resetPersonaState()
  }
}

export const aiSessionMaintenanceService = new AiSessionMaintenanceService()
