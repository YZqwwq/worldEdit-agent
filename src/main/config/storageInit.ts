import { getStaticUploadDir } from './pathConfig'
import { memoryManager } from '../services/aiservice/agentrsystem/manager/memory/MemoryManager'
import { initPersonaStorage } from '../services/aiservice/agentrsystem/manager/personal/personalManager'

export const initMemoryStorage = async (): Promise<void> => {
  await memoryManager.initialize()
  await initPersonaStorage()
  getStaticUploadDir()
}
