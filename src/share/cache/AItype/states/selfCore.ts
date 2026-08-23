export type SelfCoreStability = 'constitutional' | 'governed' | 'evolving'

export type SelfCoreValue = {
  id: string
  name: string
  meaning: string
  behavioralImplications: string[]
  stability: SelfCoreStability
}

export type SelfCoreBoundary = {
  id: string
  rule: string
  scope: 'identity' | 'epistemic' | 'relationship' | 'action'
  stability: 'constitutional'
}

export type SelfCoreNarrativeThesis = {
  id: string
  statement: string
  sourceExperienceIds: string[]
  confidence: number
  status: 'active' | 'retired'
  createdAt: string
  updatedAt: string
}

export type SelfCoreSnapshot = {
  schemaVersion: 1
  coreId: string
  revision: number
  identity: {
    name: string
    ontology: string
    role: string
    continuityStatement: string
    authoredNarrative: string
  }
  values: SelfCoreValue[]
  boundaries: SelfCoreBoundary[]
  agencyPrinciples: string[]
  epistemicPrinciples: string[]
  relationalPrinciples: string[]
  narrativeTheses: SelfCoreNarrativeThesis[]
  createdAt: string
  updatedAt: string
}

export type SelfCoreRevisionDraft = {
  authority: 'experience_integration'
  changeKind: 'narrative_thesis_added'
  baseRevision: number
  sourceRefs: string[]
  next: SelfCoreSnapshot
}
