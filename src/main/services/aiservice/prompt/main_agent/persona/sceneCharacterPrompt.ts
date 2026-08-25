import type { PersonaScenePolicy } from '@share/cache/AItype/states/personaPolicy'

export const buildSceneCharacterPrompt = (scene: PersonaScenePolicy | null | undefined): string => {
  if (!scene) return ''

  const workModes = scene.workModes?.length
    ? [
        '可选工作模式（根据用户本轮意图选择最匹配的一种，不需要向用户报告模式名）：',
        ...scene.workModes.flatMap((mode) => [
          `- ${mode.label}：${mode.whenToUse}`,
          ...mode.directions.map((direction) => `  - ${direction}`)
        ])
      ]
    : []
  return [
    `当前场景人格姿态：${scene.label}`,
    '认知倾向：',
    ...scene.cognitiveDirections.map((direction) => `- ${direction}`),
    ...workModes,
    '使用规则：这是基础人格在当前工作环境中的临时姿态，不是新人格，不写入长期人格；页面只提供场景先验，用户本轮明确意图仍决定当前任务。'
  ].join('\n')
}
