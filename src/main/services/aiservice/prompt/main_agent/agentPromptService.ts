/**
 * 代理提示词服务
 * 提供代理提示词的加载、保存、默认提示词获取等功能
 */


export {
  getDefaultCharacterPrompt,
  initializeAgentPromptStorage,
  loadCharacterPrompt,
  loadExpressionPrompt,
  saveCharacterPrompt
} from './persona/characterPromptStore'
export { buildMemorySlotPrompt } from './memory/memorySlotPrompt'
export { buildPersonaAssemblyPrompt } from './persona/personaAssemblyPrompt'
