/**
 * 代理提示词服务
 * 提供代理提示词的加载、保存、默认提示词获取等功能
 */

export {
  getDefaultCharacterPrompt,
  initializeAgentPromptStorage,
  loadCharacterPrompt,
  loadExpressionPrompt,
  loadExpressionPromptProfile,
  loadMoodPrompt,
  saveCharacterPrompt
} from './persona/characterPromptStore'
export {
  renderExpressionPromptProfileCatalog,
  resolveExpressionPromptProfile
} from './persona/expressionPromptProfiles'
export { buildPersonaAssemblyPrompt } from './persona/personaAssemblyPrompt'
export { buildPersonaAssemblyPromptParts } from './persona/personaAssemblyPrompt'
