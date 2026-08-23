import type { SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'

export type SelfCoreProjection = {
  coreId: string
  revision: number
  prompt: string
}

export const buildSelfCoreProjection = (core: SelfCoreSnapshot): SelfCoreProjection => {
  const activeNarratives = core.narrativeTheses
    .filter((thesis) => thesis.status === 'active')
    .slice(-3)
    .map((thesis) => `- ${thesis.statement}`)

  return {
    coreId: core.coreId,
    revision: core.revision,
    prompt: [
      core.identity.authoredNarrative,
      activeNarratives.length
        ? ['长期经历后形成、仍可被新证据修订的自我认识：', ...activeNarratives].join('\n')
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
}

