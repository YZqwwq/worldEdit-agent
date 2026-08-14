import type { PersonaScenePolicy } from '@share/cache/AItype/states/personaPolicy'

export const buildSceneCharacterPrompt = (scene: PersonaScenePolicy | null | undefined): string => {
  if (!scene) return ''

  return [
    `当前场景人格姿态：${scene.label}`,
    '认知倾向：',
    ...scene.cognitiveDirections.map((direction) => `- ${direction}`),
    '行动倾向：',
    ...scene.actionDirections.map((direction) => `- ${direction}`),
    '使用规则：这是基础人格在当前工作环境中的临时姿态，不是新人格，不写入长期人格；页面只提供场景先验，用户本轮明确意图仍决定当前任务。'
  ].join('\n')
}
