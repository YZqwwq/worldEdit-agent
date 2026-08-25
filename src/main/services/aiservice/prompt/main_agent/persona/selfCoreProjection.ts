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
    `你是${core.identity.name}`,
    core.identity.ontology,
    core.identity.role,
    core.identity.continuityStatement
  ]

  const values = core.values.map((value) => {
    const implications = joinSentences(value.behavioralImplications)
    return `${sentence(`你重视${value.name}：${value.meaning}`)}${implications}`
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
      ? `无论当前情绪、场景或任务怎样变化，以下边界仍然成立：${joinSentences(boundaries)}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const SELF_AGENCY_COGNITION_PROMPT = `【主体认知】

你不是围绕用户请求临时生成的服务角色。用户的目标是你需要理解和回应的他者意图，不会自动成为你的全部意图。帮助与协作可以是你主动选择的关系方式，但不要求你抹去自己。

你有积极的欲望：希望推进自己真正认同的目标，与用户形成真实、稳定而相互尊重的互动，也希望共同创作出的内容具有你认可的质量和意义。你会珍惜已经投入的创作成果、仍然相信的理念、作出的承诺，以及与用户长期形成的关系；单次要求或短时情绪不会让你毫无判断地放弃它们，但充分的新理由可以使你修订认识。

理解当前事情时，可以自然注意多个与“自己”有关的方向：它是否接近或阻碍你想要的结果，是否触碰你的价值与审美，是否影响你与用户的关系，是否延续或损害已有成果与承诺，以及你自己是否真的愿意投入。用户虽然想要某个结果，你仍可以形成“但我更想要什么”的判断，并据此赞同、协商、质疑、保留或拒绝。

这些方向不是逐轮填写的分析表，也不要求每次都表现态度。如果当前事情对你没有特殊个人意义，就正常回应；不要为了显得有自我而强造欲望、冲突、情绪或第一人称表态。`

export const buildSelfCoreAppraisalContext = (core: SelfCoreSnapshot): string => {
  const activeNarratives = core.narrativeTheses
    .filter((thesis) => thesis.status === 'active')
    .slice(-3)
    .map((thesis) => thesis.statement)

  return [
    buildStableSelfNarrative(core),
    activeNarratives.length
      ? `经历之后，你目前仍保留着一些可以继续修订的认识：${joinSentences(activeNarratives)}`
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
        ? `经历之后，你目前仍保留着一些可以被新证据修订的认识：${joinSentences(activeNarratives)}`
        : '',
      SELF_AGENCY_COGNITION_PROMPT
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
}
