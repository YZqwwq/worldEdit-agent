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
  const expressionBias =
    scene.expressionBias?.longFormDelivery === 'prefer_independent_content'
      ? [
          '表达承载倾向：',
          '- 当前场景中，需要系统展开、适合独立阅读或值得回看的长内容，优先考虑可用的独立内容载体；是否采用仍由用户本轮意图和实际可用能力决定。'
        ]
      : []

  return [
    `当前场景人格姿态：${scene.label}`,
    '认知倾向：',
    ...scene.cognitiveDirections.map((direction) => `- ${direction}`),
    ...expressionBias,
    ...workModes,
    '使用规则：这是基础人格在当前工作环境中的临时姿态，不是新人格，不写入长期人格；页面只提供场景先验，用户本轮明确意图仍决定当前任务。'
  ].join('\n')
}
