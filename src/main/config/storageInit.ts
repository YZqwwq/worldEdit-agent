import { getRuntimeStaticRoot, getStaticAvatarDir, getStaticUploadDir } from './pathConfig'
import { memoryManager } from '../services/aiservice/agentrsystem/manager/memory/MemoryManager'
import { initPersonaStorage } from '../services/aiservice/agentrsystem/manager/personal/personalManager'
import { initializeAgentPromptStorage } from '../services/aiservice/prompt/main_agent/agentPromptService'

export const initMemoryStorage = async (): Promise<void> => {
  await memoryManager.initialize()
  await initPersonaStorage()
  await initializeAgentPromptStorage()
  getRuntimeStaticRoot()
  getStaticUploadDir()
  getStaticAvatarDir()
}
