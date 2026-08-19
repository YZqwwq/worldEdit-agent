import { In, type DataSource } from 'typeorm'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import type { WorldDocumentDiffReferencePayload } from '@share/cache/worldbuilding/worldDocumentHistory'
import { buildWorldDocumentContentDiff } from './worldDocumentDiffService'

const DOCUMENT_DIFF_REF_PATTERN = /^document-diff:([^:]+):(\d+):(\d+)$/

export type ParsedWorldDocumentDiffRef = {
  documentId: string
  beforeRevision: number
  afterRevision: number
}

export const parseWorldDocumentDiffRef = (
  diffRef: string
): ParsedWorldDocumentDiffRef | null => {
  const match = DOCUMENT_DIFF_REF_PATTERN.exec(String(diffRef || '').trim())
  if (!match) return null
  const beforeRevision = Number(match[2])
  const afterRevision = Number(match[3])
  if (afterRevision <= beforeRevision) return null
  return { documentId: match[1], beforeRevision, afterRevision }
}

const selectContentVersion = (
  versions: WorldDocumentContentVersionRecord[],
  revision: number
): WorldDocumentContentVersionRecord | undefined =>
  versions
    .filter((version) => version.sourceRevision === revision)
    .sort((left, right) => {
      if (left.sourceFormat !== right.sourceFormat) return left.sourceFormat === 'markdown' ? -1 : 1
      return right.createdAt.getTime() - left.createdAt.getTime()
    })[0]

export const getWorldDocumentDiffByRefWithDataSource = async (
  dataSource: DataSource,
  diffRef: string
): Promise<WorldDocumentDiffReferencePayload> => {
  const normalizedRef = String(diffRef || '').trim()
  const parsed = parseWorldDocumentDiffRef(normalizedRef)
  if (!parsed) throw new Error('Invalid world document Diff reference')
  const { documentId, beforeRevision, afterRevision } = parsed

  const versions = await dataSource.getRepository(WorldDocumentContentVersionRecord).find({
    where: {
      documentId,
      sourceRevision: In([beforeRevision, afterRevision])
    }
  })
  const before = selectContentVersion(versions, beforeRevision)
  const after = selectContentVersion(versions, afterRevision)
  if (!before || !after) throw new Error('World document Diff source is no longer available')

  const diff = buildWorldDocumentContentDiff(
    { format: before.sourceFormat, content: before.contentSource },
    { format: after.sourceFormat, content: after.contentSource }
  )
  if (!diff) throw new Error('World document Diff contains no content changes')

  return { diffRef: normalizedRef, documentId, beforeRevision, afterRevision, diff }
}
