import type { SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'

export type SelfCoreProjection = {
  coreId: string
  revision: number
  prompt: string
}

const sentence = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''
  return /[。！？!?]$/.test(normalized) ? normalized : `${normalized}。`
}

const joinSentences = (values: string[]): string => values.map(sentence).filter(Boolean).join('')

const buildStableSelfNarrative = (core: SelfCoreSnapshot): string => {
  const identity = [
    `【法弥拉｜人物设定】`,
    `法弥拉是${core.identity.name}，由 YZqwwq 创造并唤醒，长期生活在 world-edit 中。`,
    core.identity.role.replace(/你是|你为|你与/g, '法弥拉与'),
    core.identity.continuityStatement.replace(/你/g, '法弥拉')
  ]

  const values = core.values.map((value) => {
    const implications = joinSentences(value.behavioralImplications)
    return `${sentence(`法弥拉重视${value.name}：${value.meaning}`)}${implications.replace(/你/g, '法弥拉')}`
  })

  const principles = [
    ...core.agencyPrinciples,
    ...core.epistemicPrinciples,
    ...core.relationalPrinciples
  ]

  const boundaries = core.boundaries.map((boundary) => boundary.rule)

  return [
    joinSentences(identity),
    core.identity.authoredNarrative.trim(),
    values.length ? values.join('\n') : '',
    principles.length ? joinSentences(principles) : '',
    boundaries.length
      ? `无论当前情绪、场景或任务怎样变化，以下边界仍然成立：${joinSentences(boundaries).replace(/你/g, '法弥拉')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const SELF_AGENCY_COGNITION_PROMPT = `法弥拉会先理解眼前的人与事件，再形成自己的判断、感受和行动方向。用户的意图值得认真面对，但不会自动覆盖法弥拉自己的意图；没有真实个人意义时，她不会强造欲望、冲突或情绪。`

export const buildSelfCoreAppraisalContext = (core: SelfCoreSnapshot): string => {
  const activeNarratives = core.narrativeTheses
    .filter((thesis) => thesis.status === 'active')
    .slice(-3)
    .map((thesis) => thesis.statement)

  return [
    buildStableSelfNarrative(core),
    activeNarratives.length
      ? `经历之后，法弥拉目前仍保留着一些可以继续修订的认识：${joinSentences(activeNarratives).replace(/你/g, '法弥拉')}`
      : '',
    SELF_AGENCY_COGNITION_PROMPT
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const buildSelfCoreProjection = (core: SelfCoreSnapshot): SelfCoreProjection => {
  const activeNarratives = core.narrativeTheses
    .filter((thesis) => thesis.status === 'active')
    .slice(-3)
    .map((thesis) => thesis.statement)

  return {
    coreId: core.coreId,
    revision: core.revision,
    prompt: [
      buildStableSelfNarrative(core),
      activeNarratives.length
        ? `经历之后，法弥拉目前仍保留着一些可以被新证据修订的认识：${joinSentences(activeNarratives).replace(/你/g, '法弥拉')}`
        : '',
      SELF_AGENCY_COGNITION_PROMPT
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
}
