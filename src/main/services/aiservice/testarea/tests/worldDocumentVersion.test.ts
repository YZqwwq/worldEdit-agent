import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { DataSource, In } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentCheckpointRecord } from '@share/entity/database/WorldDocumentCheckpointRecord'
import { WorldDocumentIntegrityCacheRecord } from '@share/entity/database/WorldDocumentIntegrityCacheRecord'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import {
  checkoutWorldDocumentCommitWithManager,
  applyWorldDocumentCommitWithManager,
  commitWorldDocumentChangeSetWithManager,
  ensureWorldDocumentBaselineWithManager,
  readTreeDocuments,
  reconcilePendingWorldDocumentChangeSetsWithDataSource,
  restoreWorldDocumentCommitWithManager,
  stageWorldDocumentChangeWithManager
} from '../../../worldbuilding/worldDocumentVersionService'
import { buildWorldDocumentContentDiff } from '../../../worldbuilding/worldDocumentDiffService'
import { worldDocumentMarkdownToHtml } from '../../ai-utils/tools/document/worldDocumentMarkdownCodec'
import {
  getCachedWorldDocumentIntegrityReport,
  inspectWorldDocumentHistory,
  pruneUnreachableWorldDocumentObjects
} from '../../../worldbuilding/worldDocumentIntegrityService'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'
import {
  applyWorldDocumentMergeWithManager,
  previewWorldDocumentMergeWithManager
} from '../../../worldbuilding/worldDocumentMergeService'
import {
  buildWorldDocumentVersionPackageWithDataSource,
  importWorldDocumentVersionPackageWithDataSource,
  validateWorldDocumentVersionPackage
} from '../../../worldbuilding/worldDocumentVersionPackageService'
import { mergeWorldDocumentText } from '../../../worldbuilding/worldDocumentThreeWayTextMerge'
import { applicationEntities } from '../../../../database/applicationEntities'
import { APPLICATION_SCHEMA_BASELINE_TABLE_SQL } from '../../../../database/migrations/applicationSchemaBaseline'
import { getWorldDocumentDiffByRefWithDataSource } from '../../../worldbuilding/worldDocumentDiffReferenceResolver'
import { migrateWorldEntityDocuments } from '../../../../database/migrations/migrateWorldEntityDocuments'
import { resolveWorldDocumentHumanSessionWithDataSource } from '../../../worldbuilding/worldDocumentHumanSessionService'

const sqliteTest = (name: string, execute: () => Promise<void>): void => {
  test(name, { skip: process.env.RUN_DOCUMENT_VERSION_SQLITE_TESTS !== '1' }, execute)
}

type TreeEntry = {
  documentId: string
  title: string
  revision: number
  contentVersionId: string
  childrenTreeHash: string | null
}

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    entities: [
      WorldEntityDocumentRecord,
      WorldDocumentContentVersionRecord,
      WorldDocumentTreeObjectRecord,
      WorldDocumentCommitRecord,
      WorldDocumentChangeRecord,
      WorldDocumentBranchRecord,
      WorldDocumentCheckpointRecord,
      WorldDocumentIntegrityCacheRecord,
      MainAgentChangeSetRecord,
      MainAgentTurnRecord
    ]
  })
  await dataSource.initialize()
  await runAppSchemaMigrations(dataSource)
  return dataSource
}

const documentState = (
  id: string,
  input: Partial<WorldEntityDocumentRecord> = {}
): Partial<WorldEntityDocumentRecord> => ({
  id,
  worldId: 'world-1',
  parentDocumentId: null,
  title: id,
  contentHtml: `<p>${id}</p>`,
  contentFormat: 'html',
  sortKey: id,
  revision: 1,
  schemaVersion: 1,
  ...input
})

const readTree = async (dataSource: DataSource, hash: string): Promise<TreeEntry[]> => {
  const tree = await dataSource
    .getRepository(WorldDocumentTreeObjectRecord)
    .findOneByOrFail({ hash })
  return JSON.parse(tree.entriesJson) as TreeEntry[]
}

test('document diff compares the persisted editing source instead of runtime HTML', () => {
  const diff = buildWorldDocumentContentDiff(
    { format: 'markdown', content: '# 标题\n旧内容' },
    { format: 'markdown', content: '# 标题\n新内容' }
  )
  assert.ok(diff)
  assert.equal(diff.addedLines, 1)
  assert.equal(diff.removedLines, 1)
  assert.deepEqual(
    diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== 'context'),
    [
      { kind: 'removed', text: '旧内容' },
      { kind: 'added', text: '新内容' }
    ]
  )
  assert.deepEqual(diff.hunks[0].headingPath, ['标题'])
  assert.deepEqual(diff.hunks[0].anchorTexts, ['新内容', '标题'])
})

test('editor HTML history is converted only for readable Diff presentation', () => {
  const diff = buildWorldDocumentContentDiff(
    { format: 'html_editor', content: '<h1>标题</h1><p>旧内容</p>' },
    { format: 'html_editor', content: '<h1>标题</h1><p>新内容</p>' }
  )
  assert.ok(diff)
  assert.ok(diff.hunks.every((hunk) => hunk.lines.every((line) => !line.text.includes('<h1>'))))
  assert.equal(diff.addedLines, 1)
  assert.equal(diff.removedLines, 1)
})

test('a deletion-only Diff locates through content that still exists after the change', () => {
  const diff = buildWorldDocumentContentDiff(
    { format: 'markdown', content: '# 标题\n保留上文\n将被删除\n保留下文' },
    { format: 'markdown', content: '# 标题\n保留上文\n保留下文' }
  )
  assert.ok(diff)
  assert.equal(diff.addedLines, 0)
  assert.equal(diff.hunks[0].anchorTexts.includes('将被删除'), false)
  assert.equal(diff.hunks[0].anchorTexts.includes('保留下文'), true)
})

sqliteTest('a document Diff reference rebuilds its immutable revision pair', async () => {
  const dataSource = await createDataSource()
  try {
    const repository = dataSource.getRepository(WorldDocumentContentVersionRecord)
    await repository.save([
      repository.create({
        id: 'content:diff-before',
        worldId: 'world-1',
        documentId: 'document-diff-a',
        sourceRevision: 4,
        sourceFormat: 'markdown',
        contentSource: '# 设定\n\n旧内容',
        contentHash: createHash('sha256').update('before').digest('hex')
      }),
      repository.create({
        id: 'content:diff-after',
        worldId: 'world-1',
        documentId: 'document-diff-a',
        sourceRevision: 5,
        sourceFormat: 'markdown',
        contentSource: '# 设定\n\n新内容',
        contentHash: createHash('sha256').update('after').digest('hex')
      })
    ])

    const result = await getWorldDocumentDiffByRefWithDataSource(
      dataSource,
      'document-diff:document-diff-a:4:5'
    )
    assert.equal(result.beforeRevision, 4)
    assert.equal(result.afterRevision, 5)
    assert.equal(result.diff.addedLines, 1)
    assert.equal(result.diff.removedLines, 1)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('a staged content edit creates a baseline and one immutable world commit', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const original = await documents.save(documents.create(documentState('doc-a')))
    const before = documents.create({ ...original })
    original.contentHtml = worldDocumentMarkdownToHtml('# Edited source')
    original.revision = 2
    const after = await documents.save(original)

    await dataSource.transaction(async (manager) => {
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'turn:1',
        operation: 'update',
        before,
        after,
        source: { format: 'markdown', content: '# Edited source' },
        summary: '更新人物简介'
      })
      await commitWorldDocumentChangeSetWithManager(manager, 'turn:1', 'agent')
    })

    const commits = await dataSource.getRepository(WorldDocumentCommitRecord).find({
      order: { sequence: 'ASC' }
    })
    assert.equal(commits.length, 2)
    assert.equal(commits[0].origin, 'system')
    assert.equal(commits[1].parentCommitId, commits[0].id)
    assert.equal(commits[1].changeSetId, 'turn:1')

    const currentEntry = (await readTree(dataSource, commits[1].rootTreeHash))[0]
    const currentContent = await dataSource
      .getRepository(WorldDocumentContentVersionRecord)
      .findOneByOrFail({ id: currentEntry.contentVersionId })
    assert.equal(currentContent.sourceFormat, 'markdown')
    assert.equal(currentContent.contentSource, '# Edited source')
    assert.notEqual(currentContent.contentSource, after.contentHtml)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('human history sessions rotate after commit and recover orphan staged work', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const original = await documents.save(documents.create(documentState('doc-session')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, original.worldId)
    )

    const closedBefore = documents.create({ ...original })
    original.contentHtml = '<p>closed</p>'
    original.revision = 2
    const closedAfter = await documents.save(original)
    await dataSource.transaction(async (manager) => {
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:closed-session',
        operation: 'update',
        before: closedBefore,
        after: closedAfter,
        source: { format: 'html_editor', content: closedAfter.contentHtml }
      })
      await commitWorldDocumentChangeSetWithManager(manager, 'human:closed-session', 'human')
    })
    const rotated = await resolveWorldDocumentHumanSessionWithDataSource(dataSource, {
      worldId: original.worldId,
      preferredSessionId: 'closed-session'
    })
    assert.equal(rotated.status, 'rotated')
    assert.notEqual(rotated.sessionId, 'closed-session')

    const orphanOneBefore = documents.create({ ...closedAfter })
    closedAfter.contentHtml = '<p>orphan one</p>'
    closedAfter.revision = 3
    const orphanOneAfter = await documents.save(closedAfter)
    await dataSource.transaction((manager) =>
      stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:orphan-one',
        operation: 'update',
        before: orphanOneBefore,
        after: orphanOneAfter,
        source: { format: 'html_editor', content: orphanOneAfter.contentHtml },
        summary: '第一段未提交编辑'
      })
    )

    const orphanTwoBefore = documents.create({ ...orphanOneAfter })
    orphanOneAfter.contentHtml = '<p>orphan two</p>'
    orphanOneAfter.revision = 4
    const orphanTwoAfter = await documents.save(orphanOneAfter)
    await dataSource.transaction((manager) =>
      stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:orphan-two',
        operation: 'update',
        before: orphanTwoBefore,
        after: orphanTwoAfter,
        source: { format: 'html_editor', content: orphanTwoAfter.contentHtml },
        summary: '第二段未提交编辑'
      })
    )

    const recovered = await resolveWorldDocumentHumanSessionWithDataSource(dataSource, {
      worldId: original.worldId,
      preferredSessionId: 'new-local-session'
    })
    assert.equal(recovered.status, 'recovered')
    assert.equal(recovered.sessionId, 'new-local-session')
    assert.equal(recovered.recoveredSessionCount, 2)
    const staged = await dataSource.getRepository(WorldDocumentChangeRecord).findBy({
      worldId: original.worldId,
      status: 'staged'
    })
    assert.equal(staged.length, 1)
    assert.equal(staged[0].changeSetId, 'human:new-local-session')
    assert.equal(
      (JSON.parse(staged[0].beforeStateJson!) as { revision: number }).revision,
      2
    )
    assert.equal(
      (JSON.parse(staged[0].afterStateJson!) as { revision: number }).revision,
      4
    )

    const [commit] = await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(manager, staged[0].changeSetId, 'human')
    )
    const committedDocuments = await dataSource.transaction((manager) =>
      readTreeDocuments(manager, original.worldId, commit.rootTreeHash)
    )
    assert.equal(committedDocuments.get(original.id)?.source.content, '<p>orphan two</p>')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('legacy documents create one idempotent baseline containing the full tree', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    await documents.save([
      documents.create(documentState('legacy-root', { title: '人物志' })),
      documents.create(
        documentState('legacy-child', {
          parentDocumentId: 'legacy-root',
          title: '早年经历',
          sortKey: '0002'
        })
      )
    ])

    const first = await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )
    const second = await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )
    const snapshot = await dataSource.transaction((manager) =>
      readTreeDocuments(manager, 'world-1', first.rootTreeHash)
    )
    const branch = await dataSource
      .getRepository(WorldDocumentBranchRecord)
      .findOneByOrFail({ worldId: 'world-1', active: true })

    assert.equal(second.id, first.id)
    assert.equal(first.sequence, 1)
    assert.equal(first.origin, 'system')
    assert.match(first.changeSetId, /^baseline:/)
    assert.equal(branch.headCommitId, first.id)
    assert.equal(await dataSource.getRepository(WorldDocumentCommitRecord).count(), 1)
    assert.deepEqual([...snapshot.keys()].sort(), ['legacy-child', 'legacy-root'])
    assert.equal(snapshot.get('legacy-child')?.state.parentDocumentId, 'legacy-root')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'tree commits detect create, move and subtree deletion without removing old trees',
  async () => {
    const dataSource = await createDataSource()
    try {
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      const root = await documents.save(documents.create(documentState('root')))

      const child = await documents.save(
        documents.create(documentState('child', { parentDocumentId: root.id }))
      )
      await dataSource.transaction(async (manager) => {
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:create',
          operation: 'create',
          before: null,
          after: child,
          source: { format: 'html_editor', content: child.contentHtml },
          summary: '新增子文档'
        })
        await commitWorldDocumentChangeSetWithManager(manager, 'human:create', 'human')
      })

      const createCommit = await dataSource
        .getRepository(WorldDocumentCommitRecord)
        .findOneByOrFail({ changeSetId: 'human:create' })
      const createRootEntry = (await readTree(dataSource, createCommit.rootTreeHash))[0]
      assert.ok(createRootEntry.childrenTreeHash)
      assert.equal(
        (await readTree(dataSource, createRootEntry.childrenTreeHash!))[0].documentId,
        'child'
      )

      const childBeforeMove = documents.create({ ...child })
      child.parentDocumentId = null
      child.revision = 2
      await documents.save(child)
      await dataSource.transaction(async (manager) => {
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:move',
          operation: 'move',
          before: childBeforeMove,
          after: child,
          summary: '移到根目录'
        })
        await commitWorldDocumentChangeSetWithManager(manager, 'human:move', 'human')
      })
      const moveCommit = await dataSource
        .getRepository(WorldDocumentCommitRecord)
        .findOneByOrFail({ changeSetId: 'human:move' })
      assert.deepEqual(
        (await readTree(dataSource, moveCommit.rootTreeHash)).map((entry) => entry.documentId),
        ['child', 'root']
      )

      const deleted = [documents.create({ ...root }), documents.create({ ...child })]
      await documents.remove([root, child])
      await dataSource.transaction(async (manager) => {
        for (const record of deleted) {
          await stageWorldDocumentChangeWithManager(manager, {
            changeSetId: 'human:delete',
            operation: 'delete',
            before: record,
            after: null,
            summary: '删除文档树'
          })
        }
        await commitWorldDocumentChangeSetWithManager(manager, 'human:delete', 'human')
      })
      const deleteCommit = await dataSource
        .getRepository(WorldDocumentCommitRecord)
        .findOneByOrFail({ changeSetId: 'human:delete' })
      assert.deepEqual(await readTree(dataSource, deleteCommit.rootTreeHash), [])
      assert.equal((await readTree(dataSource, createCommit.rootTreeHash))[0].documentId, 'root')

      const restored = await dataSource.transaction((manager) =>
        restoreWorldDocumentCommitWithManager(manager, {
          targetCommitId: createCommit.id,
          expectedHeadCommitId: deleteCommit.id,
          summary: '撤销删除文档树'
        })
      )
      assert.equal(restored.parentCommitId, deleteCommit.id)
      const restoredDocuments = await documents.find({ order: { sortKey: 'ASC' } })
      assert.deepEqual(
        restoredDocuments.map((document) => [document.id, document.parentDocumentId]),
        [
          ['child', 'root'],
          ['root', null]
        ]
      )
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('repeated autosaves in one session collapse into one committed change', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    let current = await documents.save(documents.create(documentState('doc-a')))
    const initial = documents.create({ ...current })

    for (const [revision, source] of [
      [2, '第一段'],
      [3, '第一段完成']
    ] as const) {
      current.contentHtml = `<p>${source}</p>`
      current.revision = revision
      current = await documents.save(current)
      await dataSource.transaction((manager) =>
        stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:session-1',
          operation: 'update',
          before: revision === 2 ? initial : current,
          after: current,
          source: { format: 'html_editor', content: current.contentHtml },
          summary: '编辑正文'
        })
      )
    }
    await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(manager, 'human:session-1', 'human')
    )

    const changes = await dataSource.getRepository(WorldDocumentChangeRecord).findBy({
      changeSetId: 'human:session-1'
    })
    assert.equal(changes.length, 1)
    const finalContent = await dataSource
      .getRepository(WorldDocumentContentVersionRecord)
      .findOneByOrFail({ id: changes[0].afterContentVersionId! })
    assert.equal(finalContent.contentSource, '<p>第一段完成</p>')
    assert.equal(changes[0].contentSource, null)
    assert.equal(changes[0].status, 'committed')
  } finally {
    await dataSource.destroy()
  }
})

test('three-way Markdown merge combines disjoint edits and rejects overlapping edits', () => {
  const base = '# 第一章\n原始一\n# 第二章\n原始二'
  assert.equal(
    mergeWorldDocumentText(
      base,
      '# 第一章\n当前修改\n# 第二章\n原始二',
      '# 第一章\n原始一\n# 第二章\n来源修改'
    ),
    '# 第一章\n当前修改\n# 第二章\n来源修改'
  )
  assert.equal(
    mergeWorldDocumentText(
      base,
      '# 第一章\n当前修改\n# 第二章\n原始二',
      '# 第一章\n来源修改\n# 第二章\n原始二'
    ),
    null
  )
})

sqliteTest('a commit inherits only its parent tree plus its declared change set', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const documentA = await documents.save(documents.create(documentState('doc-a')))
    const documentB = await documents.save(documents.create(documentState('doc-b')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    const beforeA = documents.create({ ...documentA })
    documentA.contentHtml = '<p>A staged</p>'
    documentA.revision = 2
    await documents.save(documentA)
    await dataSource.transaction((manager) =>
      stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'turn:a',
        operation: 'update',
        before: beforeA,
        after: documentA,
        source: { format: 'markdown', content: 'A staged' }
      })
    )

    const beforeB = documents.create({ ...documentB })
    documentB.contentHtml = '<p>B working but uncommitted</p>'
    documentB.revision = 2
    await documents.save(documentB)
    await dataSource.transaction((manager) =>
      stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'turn:b',
        operation: 'update',
        before: beforeB,
        after: documentB,
        source: { format: 'markdown', content: 'B working but uncommitted' }
      })
    )

    const [commitA] = await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(manager, 'turn:a', 'agent')
    )
    const entriesA = await readTree(dataSource, commitA.rootTreeHash)
    const entryA = entriesA.find((entry) => entry.documentId === 'doc-a')!
    const entryB = entriesA.find((entry) => entry.documentId === 'doc-b')!
    assert.equal(entryA.revision, 2)
    assert.equal(entryB.revision, 1)
    assert.equal(
      (
        await dataSource
          .getRepository(WorldDocumentContentVersionRecord)
          .findOneByOrFail({ id: entryB.contentVersionId })
      ).contentSource,
      '<p>doc-b</p>'
    )

    const [commitB] = await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(manager, 'turn:b', 'agent')
    )
    const entriesB = await readTree(dataSource, commitB.rootTreeHash)
    assert.deepEqual(
      entriesB.map((entry) => [entry.documentId, entry.revision]),
      [
        ['doc-a', 2],
        ['doc-b', 2]
      ]
    )
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('a late stale change set cannot roll a newer parent tree backward', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const document = await documents.save(documents.create(documentState('doc-a')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    const original = documents.create({ ...document })
    document.contentHtml = '<p>older staged edit</p>'
    document.revision = 2
    await documents.save(document)
    await dataSource.transaction((manager) =>
      stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'turn:older',
        operation: 'update',
        before: original,
        after: document,
        source: { format: 'markdown', content: 'older staged edit' }
      })
    )

    const revisionTwo = documents.create({ ...document })
    document.contentHtml = '<p>newer committed edit</p>'
    document.revision = 3
    await documents.save(document)
    await dataSource.transaction(async (manager) => {
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'turn:newer',
        operation: 'update',
        before: revisionTwo,
        after: document,
        source: { format: 'markdown', content: 'newer committed edit' }
      })
      await commitWorldDocumentChangeSetWithManager(manager, 'turn:newer', 'agent')
    })

    const [lateCommit] = await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(manager, 'turn:older', 'agent')
    )
    const [entry] = await readTree(dataSource, lateCommit.rootTreeHash)
    assert.equal(entry.revision, 3)
    assert.equal(
      (
        await dataSource
          .getRepository(WorldDocumentContentVersionRecord)
          .findOneByOrFail({ id: entry.contentVersionId })
      ).contentSource,
      'newer committed edit'
    )
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('startup preserves human worktrees and commits only terminal Agent change sets', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const document = await documents.save(documents.create(documentState('doc-a')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    const stageEdit = async (changeSetId: string, revision: number): Promise<void> => {
      const before = documents.create({ ...document })
      document.contentHtml = `<p>${changeSetId}</p>`
      document.revision = revision
      await documents.save(document)
      await dataSource.transaction((manager) =>
        stageWorldDocumentChangeWithManager(manager, {
          changeSetId,
          operation: 'update',
          before,
          after: document,
          source: { format: 'markdown', content: changeSetId },
          summary: changeSetId
        })
      )
    }

    await stageEdit('human:session-1', 2)

    const turns = dataSource.getRepository(MainAgentTurnRecord)
    const activeTurn = await turns.save(
      turns.create({
        eventId: 'event-active',
        sessionId: 'default',
        consumer: 'chat_runtime',
        status: 'processing',
        userMessageId: null,
        aiMessageId: null,
        headVersionId: null,
        memoryCheckpointJson: '{}',
        errorMessage: ''
      })
    )
    const terminalTurn = await turns.save(
      turns.create({
        eventId: 'event-terminal',
        sessionId: 'default',
        consumer: 'chat_runtime',
        status: 'failed',
        userMessageId: null,
        aiMessageId: null,
        headVersionId: null,
        memoryCheckpointJson: '{}',
        errorMessage: 'process exited'
      })
    )

    const changeSets = dataSource.getRepository(MainAgentChangeSetRecord)
    await changeSets.save([
      changeSets.create({
        id: 'turn:active',
        scopeType: 'turn',
        scopeId: String(activeTurn.id),
        eventId: activeTurn.eventId,
        turnId: activeTurn.id,
        sessionId: 'default',
        lifecycle: 'open',
        title: null,
        sealedAt: null
      }),
      changeSets.create({
        id: 'turn:terminal',
        scopeType: 'turn',
        scopeId: String(terminalTurn.id),
        eventId: terminalTurn.eventId,
        turnId: terminalTurn.id,
        sessionId: 'default',
        lifecycle: 'open',
        title: null,
        sealedAt: null
      })
    ])

    await stageEdit('turn:active', 3)
    await stageEdit('turn:terminal', 4)
    await stageEdit('turn:orphan', 5)

    const result = await reconcilePendingWorldDocumentChangeSetsWithDataSource(dataSource)
    assert.deepEqual(result, {
      deferredHuman: ['human:session-1'],
      committedTerminalAgent: ['turn:terminal'],
      deferredActiveAgent: ['turn:active'],
      deferredUnowned: ['turn:orphan']
    })

    const statuses = new Map(
      (
        await dataSource.getRepository(WorldDocumentChangeRecord).find({
          order: { createdAt: 'ASC' }
        })
      ).map((change) => [change.changeSetId, change.status])
    )
    assert.equal(statuses.get('human:session-1'), 'staged')
    assert.equal(statuses.get('turn:terminal'), 'committed')
    assert.equal(statuses.get('turn:active'), 'staged')
    assert.equal(statuses.get('turn:orphan'), 'staged')
    assert.equal((await changeSets.findOneByOrFail({ id: 'turn:terminal' })).lifecycle, 'sealed')
    assert.equal((await changeSets.findOneByOrFail({ id: 'turn:active' })).lifecycle, 'open')

    const [manualCommit] = await dataSource.transaction((manager) =>
      commitWorldDocumentChangeSetWithManager(
        manager,
        'human:session-1',
        'human',
        '用户确认的版本'
      )
    )
    assert.equal(manualCommit.summary, '用户确认的版本')
    assert.equal(
      (
        await dataSource.getRepository(WorldDocumentChangeRecord).findOneByOrFail({
          changeSetId: 'human:session-1'
        })
      ).status,
      'committed'
    )
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'a committed change set rejects late writes and rolls back their document mutation',
  async () => {
    const dataSource = await createDataSource()
    try {
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      const document = await documents.save(documents.create(documentState('doc-a')))
      await dataSource.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )

      await dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorldEntityDocumentRecord)
        const before = await repository.findOneByOrFail({ id: document.id })
        const after = await repository.save(
          repository.create({ ...before, contentHtml: '<p>committed</p>', revision: 2 })
        )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:closed-session',
          operation: 'update',
          before,
          after,
          source: { format: 'html_editor', content: after.contentHtml }
        })
        await commitWorldDocumentChangeSetWithManager(manager, 'human:closed-session', 'human')
      })

      await assert.rejects(
        dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(WorldEntityDocumentRecord)
          const before = await repository.findOneByOrFail({ id: document.id })
          const after = await repository.save(
            repository.create({ ...before, contentHtml: '<p>late write</p>', revision: 3 })
          )
          await stageWorldDocumentChangeWithManager(manager, {
            changeSetId: 'human:closed-session',
            operation: 'update',
            before,
            after,
            source: { format: 'html_editor', content: after.contentHtml }
          })
        }),
        (error: unknown) =>
          error instanceof Error && 'code' in error && error.code === 'CHANGESET_CLOSED'
      )

      const persisted = await documents.findOneByOrFail({ id: document.id })
      assert.equal(persisted.revision, 2)
      assert.equal(persisted.contentHtml, '<p>committed</p>')
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('history rejects a source that differs from the stored document content', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const document = await documents.save(documents.create(documentState('doc-a')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    await assert.rejects(
      dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorldEntityDocumentRecord)
        const before = await repository.findOneByOrFail({ id: document.id })
        const after = await repository.save(
          repository.create({ ...before, contentHtml: '<p>actual</p>', revision: 2 })
        )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:mismatched-source',
          operation: 'update',
          before,
          after,
          source: { format: 'markdown', content: 'different' }
        })
      }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'DOCUMENT_HISTORY_SOURCE_MISMATCH'
    )

    const persisted = await documents.findOneByOrFail({ id: document.id })
    assert.equal(persisted.revision, 1)
    assert.equal(persisted.contentHtml, '<p>doc-a</p>')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('restoring a commit also restores the document schema version', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const document = await documents.save(documents.create(documentState('doc-a')))
    const target = await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    const schemaTwoCommit = await dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorldEntityDocumentRecord)
      const before = await repository.findOneByOrFail({ id: document.id })
      const after = await repository.save(
        repository.create({ ...before, schemaVersion: 2, revision: 2 })
      )
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:schema-two',
        operation: 'update',
        before,
        after,
        source: { format: 'html_editor', content: after.contentHtml }
      })
      const [commit] = await commitWorldDocumentChangeSetWithManager(
        manager,
        'human:schema-two',
        'human'
      )
      return commit
    })

    const restored = await dataSource.transaction((manager) =>
      restoreWorldDocumentCommitWithManager(manager, {
        targetCommitId: target.id,
        expectedHeadCommitId: schemaTwoCommit.id
      })
    )
    const persisted = await documents.findOneByOrFail({ id: document.id })
    assert.notEqual(restored.id, schemaTwoCommit.id)
    assert.equal(persisted.schemaVersion, 1)
    assert.equal(persisted.revision, 3)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'selective restore changes only the chosen document and records its intent',
  async () => {
    const dataSource = await createDataSource()
    try {
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      await documents.save([
        documents.create(documentState('doc-a')),
        documents.create(documentState('doc-b'))
      ])
      const baseline = await dataSource.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )

      const edited = await dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorldEntityDocumentRecord)
        for (const id of ['doc-a', 'doc-b']) {
          const before = await repository.findOneByOrFail({ id })
          const after = await repository.save(
            repository.create({ ...before, contentHtml: `<p>${id}-edited</p>`, revision: 2 })
          )
          await stageWorldDocumentChangeWithManager(manager, {
            changeSetId: 'human:edit-both',
            operation: 'update',
            before,
            after,
            source: { format: 'html_editor', content: after.contentHtml }
          })
        }
        const [commit] = await commitWorldDocumentChangeSetWithManager(
          manager,
          'human:edit-both',
          'human'
        )
        return commit
      })

      const restored = await dataSource.transaction((manager) =>
        restoreWorldDocumentCommitWithManager(manager, {
          targetCommitId: baseline.id,
          expectedHeadCommitId: edited.id,
          documentIds: ['doc-a']
        })
      )

      assert.equal((await documents.findOneByOrFail({ id: 'doc-a' })).contentHtml, '<p>doc-a</p>')
      assert.equal(
        (await documents.findOneByOrFail({ id: 'doc-b' })).contentHtml,
        '<p>doc-b-edited</p>'
      )
      assert.equal(restored.intent, 'selective_restore')
      assert.equal(restored.restoredFromCommitId, baseline.id)
      const changes = await dataSource.getRepository(WorldDocumentChangeRecord).findBy({
        commitId: restored.id
      })
      assert.deepEqual(
        changes.map((change) => change.documentId),
        ['doc-a']
      )
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('independent document branches keep their own HEAD and shared ancestry', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    await documents.save(documents.create(documentState('doc-a')))
    const baseline = await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )
    const mainCommit = await dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorldEntityDocumentRecord)
      const before = await repository.findOneByOrFail({ id: 'doc-a' })
      const after = await repository.save(
        repository.create({ ...before, contentHtml: '<p>main</p>', revision: 2 })
      )
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:main-edit',
        operation: 'update',
        before,
        after,
        source: { format: 'html_editor', content: after.contentHtml }
      })
      return (await commitWorldDocumentChangeSetWithManager(manager, 'human:main-edit', 'human'))[0]
    })

    const branchRepository = dataSource.getRepository(WorldDocumentBranchRecord)
    const mainBranch = await branchRepository.findOneByOrFail({ worldId: 'world-1', active: true })
    mainBranch.active = false
    const draft = branchRepository.create({
      id: 'branch:draft',
      worldId: 'world-1',
      name: '草案',
      headCommitId: baseline.id,
      active: true
    })
    await branchRepository.save([mainBranch, draft])
    await dataSource.transaction((manager) =>
      checkoutWorldDocumentCommitWithManager(manager, baseline.id)
    )

    const draftCommit = await dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorldEntityDocumentRecord)
      const before = await repository.findOneByOrFail({ id: 'doc-a' })
      const after = await repository.save(
        repository.create({ ...before, contentHtml: '<p>draft</p>', revision: before.revision + 1 })
      )
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: 'human:draft-edit',
        operation: 'update',
        before,
        after,
        source: { format: 'html_editor', content: after.contentHtml }
      })
      return (
        await commitWorldDocumentChangeSetWithManager(manager, 'human:draft-edit', 'human')
      )[0]
    })

    assert.equal(draftCommit.parentCommitId, baseline.id)
    assert.equal(draftCommit.branchId, draft.id)
    assert.equal(
      (await branchRepository.findOneByOrFail({ id: draft.id })).headCommitId,
      draftCommit.id
    )
    assert.equal(
      (await branchRepository.findOneByOrFail({ id: mainBranch.id })).headCommitId,
      mainCommit.id
    )

    await branchRepository.update({ id: draft.id }, { active: false })
    await branchRepository.update({ id: mainBranch.id }, { active: true })
    await dataSource.transaction((manager) =>
      checkoutWorldDocumentCommitWithManager(manager, mainCommit.id)
    )
    const preview = await dataSource.transaction((manager) =>
      previewWorldDocumentMergeWithManager(manager, draft.id)
    )
    assert.equal(preview.baseCommitId, baseline.id)
    assert.deepEqual(
      preview.conflicts.map((conflict) => conflict.documentId),
      ['doc-a']
    )

    const mergeCommit = await dataSource.transaction((manager) =>
      applyWorldDocumentMergeWithManager(manager, {
        sourceBranchId: draft.id,
        expectedCurrentHeadCommitId: mainCommit.id,
        resolutions: { 'doc-a': 'incoming' }
      })
    )
    assert.equal(mergeCommit.parentCommitId, mainCommit.id)
    assert.equal(mergeCommit.mergeParentCommitId, draftCommit.id)
    assert.equal(mergeCommit.intent, 'merge')
    assert.equal((await documents.findOneByOrFail({ id: 'doc-a' })).contentHtml, '<p>draft</p>')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'staged Diff uses the active branch HEAD instead of another branch latest content',
  async () => {
    const dataSource = await createDataSource()
    try {
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      await documents.save(documents.create(documentState('doc-a', { contentHtml: '<p>base</p>' })))
      const baseline = await dataSource.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )
      const edit = (changeSetId: string, markdown: string) =>
        dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(WorldEntityDocumentRecord)
          const before = await repository.findOneByOrFail({ id: 'doc-a' })
          const after = await repository.save(
            repository.create({
              ...before,
              contentHtml: worldDocumentMarkdownToHtml(markdown),
              revision: before.revision + 1
            })
          )
          await stageWorldDocumentChangeWithManager(manager, {
            changeSetId,
            operation: 'update',
            before,
            after,
            source: { format: 'markdown', content: markdown }
          })
          return (await commitWorldDocumentChangeSetWithManager(manager, changeSetId, 'human'))[0]
        })

      const mainCommit = await edit('human:main-source', '# Main source')
      const branches = dataSource.getRepository(WorldDocumentBranchRecord)
      const main = await branches.findOneByOrFail({ worldId: 'world-1', active: true })
      main.active = false
      const draft = branches.create({
        id: 'branch:source-draft',
        worldId: 'world-1',
        name: '来源草案',
        headCommitId: baseline.id,
        active: true
      })
      await branches.save([main, draft])
      await dataSource.transaction((manager) =>
        checkoutWorldDocumentCommitWithManager(manager, baseline.id)
      )
      const draftCommit = await edit('human:draft-source', '# Draft source')
      const draftEntry = (await readTree(dataSource, draftCommit.rootTreeHash))[0]
      await dataSource
        .getRepository(WorldDocumentContentVersionRecord)
        .update(
          { id: draftEntry.contentVersionId },
          { createdAt: new Date('2030-01-01T00:00:00.000Z') }
        )

      await branches.update({ id: draft.id }, { active: false })
      await branches.update({ id: main.id }, { active: true })
      await dataSource.transaction((manager) =>
        checkoutWorldDocumentCommitWithManager(manager, mainCommit.id)
      )
      await dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorldEntityDocumentRecord)
        const before = await repository.findOneByOrFail({ id: 'doc-a' })
        const after = await repository.save(
          repository.create({
            ...before,
            title: 'Main renamed',
            revision: before.revision + 1
          })
        )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:main-title',
          operation: 'update',
          before,
          after
        })
      })

      const staged = await dataSource.getRepository(WorldDocumentChangeRecord).findOneByOrFail({
        changeSetId: 'human:main-title',
        documentId: 'doc-a'
      })
      const beforeContent = await dataSource
        .getRepository(WorldDocumentContentVersionRecord)
        .findOneByOrFail({ id: staged.beforeContentVersionId! })
      assert.equal(beforeContent.sourceFormat, 'markdown')
      assert.equal(beforeContent.contentSource, '# Main source')
      assert.equal(staged.beforeContentSource, null)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('revert and cherry-pick create new commits without rewriting history', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    await documents.save(documents.create(documentState('doc-a', { contentHtml: '<p>base</p>' })))
    const baseline = await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )
    const edit = async (changeSetId: string, contentHtml: string) =>
      dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorldEntityDocumentRecord)
        const before = await repository.findOneByOrFail({ id: 'doc-a' })
        const after = await repository.save(
          repository.create({ ...before, contentHtml, revision: before.revision + 1 })
        )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId,
          operation: 'update',
          before,
          after,
          source: { format: 'html_editor', content: contentHtml },
          summary: changeSetId
        })
        return (await commitWorldDocumentChangeSetWithManager(manager, changeSetId, 'human'))[0]
      })

    const first = await edit('human:first', '<p>first</p>')
    const second = await edit('human:second', '<p>second</p>')
    const reverted = await dataSource.transaction((manager) =>
      applyWorldDocumentCommitWithManager(manager, {
        commitId: first.id,
        expectedHeadCommitId: second.id,
        mode: 'revert'
      })
    )
    assert.equal(reverted.commit.parentCommitId, second.id)
    assert.equal(reverted.commit.restoredFromCommitId, first.id)
    assert.equal(reverted.commit.intent, 'revert')
    assert.equal((await documents.findOneByOrFail({ id: 'doc-a' })).contentHtml, '<p>base</p>')

    const picked = await dataSource.transaction((manager) =>
      applyWorldDocumentCommitWithManager(manager, {
        commitId: first.id,
        expectedHeadCommitId: reverted.commit.id,
        mode: 'cherry_pick'
      })
    )
    assert.equal(picked.commit.parentCommitId, reverted.commit.id)
    assert.equal(picked.commit.restoredFromCommitId, first.id)
    assert.equal(picked.commit.intent, 'cherry_pick')
    assert.equal((await documents.findOneByOrFail({ id: 'doc-a' })).contentHtml, '<p>first</p>')
    assert.equal(await dataSource.getRepository(WorldDocumentCommitRecord).count(), 5)
    assert.equal(baseline.sequence, 1)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('document history integrity inspection accepts a healthy commit graph', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    await documents.save(documents.create(documentState('doc-a')))
    await dataSource.transaction((manager) =>
      ensureWorldDocumentBaselineWithManager(manager, 'world-1')
    )

    const report = await inspectWorldDocumentHistory(dataSource)
    assert.equal(report.ok, true)
    assert.deepEqual(report.issues, [])
    assert.equal(report.counts.commits, 1)
    assert.equal(report.counts.contentVersions, 1)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'garbage collection previews and removes only unreachable immutable objects',
  async () => {
    const dataSource = await createDataSource()
    try {
      const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      await documents.save(documents.create(documentState('doc-a')))
      await dataSource.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )
      const orphanSource = 'orphan'
      const orphanContentId = `content:${hash(`orphan-doc\u0000markdown\u0000${orphanSource}`)}`
      await dataSource.getRepository(WorldDocumentContentVersionRecord).save({
        id: orphanContentId,
        worldId: 'world-1',
        documentId: 'orphan-doc',
        sourceRevision: 1,
        sourceFormat: 'markdown',
        contentSource: orphanSource,
        contentHash: hash(`markdown\u0000${orphanSource}`)
      })
      const orphanEntries = '[]'
      const orphanTreeHash = hash(orphanEntries)
      await dataSource.getRepository(WorldDocumentTreeObjectRecord).save({
        hash: orphanTreeHash,
        entriesJson: orphanEntries
      })

      const preview = await pruneUnreachableWorldDocumentObjects(dataSource, true)
      assert.equal(preview.removedContentVersionCount, 1)
      assert.equal(preview.removedTreeCount, 1)
      assert.ok(
        await dataSource
          .getRepository(WorldDocumentContentVersionRecord)
          .findOneBy({ id: orphanContentId })
      )

      const removed = await pruneUnreachableWorldDocumentObjects(dataSource, false)
      assert.deepEqual(removed, {
        dryRun: false,
        removedTreeCount: 1,
        removedContentVersionCount: 1
      })
      assert.equal(
        await dataSource
          .getRepository(WorldDocumentContentVersionRecord)
          .findOneBy({ id: orphanContentId }),
        null
      )
      assert.equal(
        await dataSource
          .getRepository(WorldDocumentTreeObjectRecord)
          .findOneBy({ hash: orphanTreeHash }),
        null
      )
      assert.equal((await inspectWorldDocumentHistory(dataSource)).ok, true)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest(
  'version packages round-trip with hash validation and idempotent object import',
  async () => {
    const source = await createDataSource()
    const target = await createDataSource()
    try {
      const documents = source.getRepository(WorldEntityDocumentRecord)
      const original = await documents.save(
        documents.create(documentState('doc-a', { contentHtml: '<p>portable</p>' }))
      )
      const baseline = await source.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )
      await source.getRepository(WorldDocumentCheckpointRecord).save({
        id: 'checkpoint:portable',
        worldId: 'world-1',
        commitId: baseline.id,
        name: '可移植检查点',
        note: ''
      })
      assert.equal(original.id, 'doc-a')
      const versionPackage = await buildWorldDocumentVersionPackageWithDataSource(source, 'world-1')
      assert.equal(
        validateWorldDocumentVersionPackage(versionPackage, 'world-1').packageHash,
        versionPackage.packageHash
      )

      const tampered = JSON.parse(JSON.stringify(versionPackage))
      tampered.objects.contents[0].contentSource = 'tampered'
      assert.throws(
        () => validateWorldDocumentVersionPackage(tampered, 'world-1'),
        /校验摘要不匹配/
      )

      const firstImport = await importWorldDocumentVersionPackageWithDataSource(
        target,
        versionPackage,
        'world-1'
      )
      assert.equal(firstImport.imported.commits, 1)
      assert.equal(firstImport.imported.contents, 1)
      assert.equal(
        (await target.getRepository(WorldEntityDocumentRecord).findOneByOrFail({ id: 'doc-a' }))
          .contentHtml,
        '<p>portable</p>'
      )
      assert.equal(
        await target.getRepository(WorldDocumentBranchRecord).countBy({ worldId: 'world-1' }),
        1
      )

      const secondImport = await importWorldDocumentVersionPackageWithDataSource(
        target,
        versionPackage,
        'world-1'
      )
      assert.equal(secondImport.imported.commits, 0)
      assert.equal(secondImport.skipped.commits, 1)
      assert.equal(
        await target.getRepository(WorldDocumentBranchRecord).countBy({ worldId: 'world-1' }),
        1
      )
      assert.equal(
        await target.getRepository(WorldDocumentCheckpointRecord).countBy({ worldId: 'world-1' }),
        1
      )
    } finally {
      await source.destroy()
      await target.destroy()
    }
  }
)

sqliteTest(
  'document history integrity inspection reports corrupted objects and change links',
  async () => {
    const dataSource = await createDataSource()
    try {
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      const document = await documents.save(documents.create(documentState('doc-a')))
      await dataSource.transaction(async (manager) => {
        await ensureWorldDocumentBaselineWithManager(manager, 'world-1')
        const before = await manager
          .getRepository(WorldEntityDocumentRecord)
          .findOneByOrFail({ id: document.id })
        const after = await manager
          .getRepository(WorldEntityDocumentRecord)
          .save(
            manager
              .getRepository(WorldEntityDocumentRecord)
              .create({ ...before, contentHtml: '<p>next</p>', revision: 2 })
          )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: 'human:integrity',
          operation: 'update',
          before,
          after,
          source: { format: 'html_editor', content: after.contentHtml }
        })
        await commitWorldDocumentChangeSetWithManager(manager, 'human:integrity', 'human')
      })

      const content = await dataSource.getRepository(WorldDocumentContentVersionRecord).findOne({
        where: { documentId: document.id },
        order: { createdAt: 'DESC' }
      })
      assert.ok(content)
      content.contentSource = 'tampered'
      await dataSource.getRepository(WorldDocumentContentVersionRecord).save(content)
      const change = await dataSource
        .getRepository(WorldDocumentChangeRecord)
        .findOneByOrFail({ changeSetId: 'human:integrity' })
      change.status = 'staged'
      await dataSource.getRepository(WorldDocumentChangeRecord).save(change)

      const report = await inspectWorldDocumentHistory(dataSource)
      const codes = new Set(report.issues.map((issue) => issue.code))
      assert.equal(report.ok, false)
      assert.equal(codes.has('CONTENT_HASH_MISMATCH'), true)
      assert.equal(codes.has('CONTENT_ID_MISMATCH'), true)
      assert.equal(codes.has('STAGED_CHANGESET_ALREADY_COMMITTED'), true)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest(
  'integrity cache is reused until a database trigger invalidates its generation',
  async () => {
    const dataSource = await createDataSource()
    try {
      await runAppSchemaMigrations(dataSource)
      const documents = dataSource.getRepository(WorldEntityDocumentRecord)
      await documents.save(documents.create(documentState('doc-a')))
      await dataSource.transaction((manager) =>
        ensureWorldDocumentBaselineWithManager(manager, 'world-1')
      )

      const first = await getCachedWorldDocumentIntegrityReport(dataSource, 'world-1')
      const cacheRepository = dataSource.getRepository(WorldDocumentIntegrityCacheRecord)
      const cached = await cacheRepository.findOneByOrFail({ worldId: 'world-1' })
      assert.equal(first.ok, true)
      assert.equal(cached.verifiedGeneration, cached.generation)
      assert.ok(cached.reportJson)
      const verifiedAt = cached.verifiedAt?.toISOString()

      const second = await getCachedWorldDocumentIntegrityReport(dataSource, 'world-1')
      const reused = await cacheRepository.findOneByOrFail({ worldId: 'world-1' })
      assert.deepEqual(second, first)
      assert.equal(reused.verifiedAt?.toISOString(), verifiedAt)

      const branchRepository = dataSource.getRepository(WorldDocumentBranchRecord)
      const branch = await branchRepository.findOneByOrFail({ worldId: 'world-1', active: true })
      branch.name = '主方案已重命名'
      await branchRepository.save(branch)
      const dirty = await cacheRepository.findOneByOrFail({ worldId: 'world-1' })
      assert.ok(dirty.generation > dirty.verifiedGeneration)
      assert.equal(dirty.reportJson, null)

      const refreshed = await getCachedWorldDocumentIntegrityReport(dataSource, 'world-1')
      const refreshedCache = await cacheRepository.findOneByOrFail({ worldId: 'world-1' })
      assert.equal(refreshed.ok, true)
      assert.equal(refreshedCache.verifiedGeneration, refreshedCache.generation)

      const content = await dataSource
        .getRepository(WorldDocumentContentVersionRecord)
        .findOneByOrFail({ worldId: 'world-1' })
      content.contentSource = 'tampered'
      await dataSource.getRepository(WorldDocumentContentVersionRecord).save(content)
      const corrupted = await getCachedWorldDocumentIntegrityReport(dataSource, 'world-1')
      assert.equal(corrupted.ok, false)
      assert.ok(corrupted.issues.some((issue) => issue.code === 'CONTENT_HASH_MISMATCH'))
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('legacy ChangeRecord sources migrate to immutable content references', async () => {
  const dataSource = await createDataSource()
  try {
    const changes = dataSource.getRepository(WorldDocumentChangeRecord)
    await changes.save(
      changes.create({
        id: 'legacy-change',
        changeSetId: 'human:legacy',
        worldId: 'world-1',
        documentId: 'doc-a',
        operation: 'update',
        beforeStateJson: JSON.stringify({ ...documentState('doc-a'), revision: 1 }),
        afterStateJson: JSON.stringify({ ...documentState('doc-a'), revision: 2 }),
        beforeSourceFormat: 'markdown',
        beforeContentSource: '# Before',
        sourceFormat: 'markdown',
        contentSource: '# After',
        beforeContentVersionId: null,
        afterContentVersionId: null,
        summary: 'legacy edit',
        status: 'staged',
        commitId: null
      })
    )

    await dataSource.query('DELETE FROM app_schema_migration WHERE id = ?', [
      '20260819_world_document_change_content_refs'
    ])
    await runAppSchemaMigrations(dataSource)

    const migrated = await changes.findOneByOrFail({ id: 'legacy-change' })
    assert.ok(migrated.beforeContentVersionId)
    assert.ok(migrated.afterContentVersionId)
    assert.equal(migrated.beforeSourceFormat, null)
    assert.equal(migrated.beforeContentSource, null)
    assert.equal(migrated.sourceFormat, null)
    assert.equal(migrated.contentSource, null)
    const contents = await dataSource.getRepository(WorldDocumentContentVersionRecord).findBy({
      id: In([migrated.beforeContentVersionId!, migrated.afterContentVersionId!])
    })
    assert.deepEqual(contents.map((content) => content.contentSource).sort(), [
      '# After',
      '# Before'
    ])
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('document history schema migration is recorded and idempotent', async () => {
  const dataSource = await createDataSource()
  try {
    await runAppSchemaMigrations(dataSource)
    await runAppSchemaMigrations(dataSource)

    const applied = (await dataSource.query('SELECT id FROM app_schema_migration WHERE id = ?', [
      '20260818_world_document_history_indexes'
    ])) as Array<{ id: string }>
    const indexes = (await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'world_document_change'"
    )) as Array<{ name: string }>
    const names = new Set(indexes.map((index) => index.name))
    assert.equal(applied.length, 1)
    assert.equal(names.has('IDX_world_document_change_status_updated'), true)
    assert.equal(names.has('IDX_world_document_change_commit'), true)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('legacy entity documents migrate into one free world document tree', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'world-document-library-migration-'))
  const databasePath = join(directory, 'database.sqlite')
  const backupPath = `${databasePath}.world-document-library-v3.temp.json`
  const database = new Database(databasePath)
  try {
    database.exec(`
      CREATE TABLE world_entity_record (
        id text PRIMARY KEY NOT NULL,
        worldId text NOT NULL,
        name text NOT NULL,
        createdAt datetime NOT NULL,
        updatedAt datetime NOT NULL
      );
      CREATE TABLE world_entity_document_record (
        id text PRIMARY KEY NOT NULL,
        ownerKind text NOT NULL,
        worldId text NOT NULL,
        ownerEntityId text,
        parentDocumentId text,
        title text NOT NULL,
        contentHtml text NOT NULL,
        contentFormat text NOT NULL,
        sortKey text NOT NULL,
        revision integer NOT NULL,
        schemaVersion integer NOT NULL,
        createdAt datetime NOT NULL,
        updatedAt datetime NOT NULL
      );
      CREATE TABLE world_document_change (id text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_checkpoint (id text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_branch (id text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_commit (id text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_tree_object (hash text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_content_version (id text PRIMARY KEY NOT NULL);
      CREATE TABLE world_document_integrity_cache (worldId text PRIMARY KEY NOT NULL);
    `)
    database.prepare(`
      INSERT INTO world_entity_record (id, worldId, name, createdAt, updatedAt)
      VALUES ('character-1', 'world-1', '菲尔娜', '2026-01-01', '2026-01-02')
    `).run()
    const insertDocument = database.prepare(`
      INSERT INTO world_entity_document_record (
        id, ownerKind, worldId, ownerEntityId, parentDocumentId, title,
        contentHtml, contentFormat, sortKey, revision, schemaVersion, createdAt, updatedAt
      ) VALUES (?, ?, 'world-1', ?, ?, ?, ?, 'html', ?, ?, 1, '2026-02-01', '2026-02-02')
    `)
    insertDocument.run(
      'foundation', 'world', null, null, '力量体系', '<p>低武世界</p>', 'a', 3
    )
    insertDocument.run(
      'character-root', 'entity', 'character-1', null, '人物志', '<p>银发剑士</p>', 'b', 7
    )
    insertDocument.run(
      'character-child', 'entity', 'character-1', 'character-root', '经历', '<p>北境之旅</p>', 'c', 2
    )
    for (const table of [
      'world_document_change',
      'world_document_checkpoint',
      'world_document_branch',
      'world_document_commit',
      'world_document_content_version'
    ]) {
      database.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run(`${table}-old`)
    }
    database.prepare(
      "INSERT INTO world_document_tree_object (hash) VALUES ('tree-old')"
    ).run()
    database.prepare(
      "INSERT INTO world_document_integrity_cache (worldId) VALUES ('world-1')"
    ).run()
  } finally {
    database.close()
  }

  try {
    migrateWorldEntityDocuments(databasePath)
    assert.equal(existsSync(backupPath), false)

    const migrated = new Database(databasePath)
    try {
      const columns = migrated.prepare('PRAGMA table_info(world_entity_document_record)').all() as Array<{ name: string }>
      const columnNames = new Set(columns.map((column) => column.name))
      assert.equal(columnNames.has('worldId'), true)
      assert.equal(columnNames.has('ownerKind'), false)
      assert.equal(columnNames.has('ownerEntityId'), false)
      const indexes = migrated.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'world_entity_document_record'"
      ).all() as Array<{ name: string }>
      const indexNames = new Set(indexes.map((index) => index.name))
      assert.equal(indexNames.has('IDX_fd71e942d059f393bcdd591642'), true)
      assert.equal(indexNames.has('IDX_d2c2a72c33b693053b95709238'), true)

      const rows = migrated.prepare(
        'SELECT * FROM world_entity_document_record ORDER BY id'
      ).all() as Array<Record<string, unknown>>
      assert.equal(rows.length, 4)
      const byId = new Map(rows.map((row) => [String(row.id), row]))
      const folder = rows.find((row) => String(row.id).startsWith('document-folder:'))
      assert.ok(folder)
      assert.equal(folder.title, '菲尔娜')
      assert.equal(folder.parentDocumentId, null)
      assert.equal(byId.get('foundation')?.parentDocumentId, null)
      assert.equal(byId.get('foundation')?.contentHtml, '<p>低武世界</p>')
      assert.equal(byId.get('foundation')?.revision, 3)
      assert.equal(byId.get('character-root')?.parentDocumentId, folder.id)
      assert.equal(byId.get('character-root')?.contentHtml, '<p>银发剑士</p>')
      assert.equal(byId.get('character-root')?.revision, 7)
      assert.equal(byId.get('character-child')?.parentDocumentId, 'character-root')

      for (const table of [
        'world_document_change',
        'world_document_checkpoint',
        'world_document_branch',
        'world_document_commit',
        'world_document_tree_object',
        'world_document_content_version',
        'world_document_integrity_cache'
      ]) {
        const count = migrated.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
        assert.equal(count.count, 0, `${table} should be reset`)
      }
    } finally {
      migrated.close()
    }

    migrateWorldEntityDocuments(databasePath)
    const secondPass = new Database(databasePath)
    try {
      const count = secondPass.prepare(
        'SELECT COUNT(*) AS count FROM world_entity_document_record'
      ).get() as { count: number }
      assert.equal(count.count, 4)
    } finally {
      secondPass.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

sqliteTest(
  'explicit migrations create the complete entity schema without synchronize',
  async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      entities: applicationEntities
    })
    await dataSource.initialize()
    try {
      await runAppSchemaMigrations(dataSource)
      const tables = (await dataSource.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )) as Array<{ name: string }>
      const tableNames = new Set(tables.map((table) => table.name))
      for (const metadata of dataSource.entityMetadatas) {
        assert.equal(
          tableNames.has(metadata.tableName),
          true,
          `missing table ${metadata.tableName}`
        )
      }
      const schemaDiff = await dataSource.driver.createSchemaBuilder().log()
      assert.deepEqual(
        schemaDiff.upQueries.map((query) => query.query),
        [],
        'entity metadata changed without an explicit schema migration'
      )
      const baseline = (await dataSource.query('SELECT id FROM app_schema_migration WHERE id = ?', [
        '20260819_application_schema_baseline'
      ])) as Array<{ id: string }>
      assert.equal(baseline.length, 1)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('explicit migrations upgrade a pre-baseline database without losing rows', async () => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    entities: applicationEntities
  })
  await dataSource.initialize()
  try {
    for (const sql of APPLICATION_SCHEMA_BASELINE_TABLE_SQL) {
      if (!sql.includes('"world_document_change"')) await dataSource.query(sql)
    }
    await dataSource.query(`
      CREATE TABLE world_document_change (
        id text PRIMARY KEY NOT NULL, changeSetId text NOT NULL, worldId text NOT NULL,
        documentId text NOT NULL, operation text NOT NULL, beforeStateJson text,
        afterStateJson text, beforeSourceFormat text, beforeContentSource text,
        sourceFormat text, contentSource text, summary text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'staged', commitId text,
        createdAt datetime NOT NULL DEFAULT (datetime('now')),
        updatedAt datetime NOT NULL DEFAULT (datetime('now'))
      )
    `)
    await dataSource.query(
      `INSERT INTO world_document_change (
        id, changeSetId, worldId, documentId, operation, beforeStateJson, afterStateJson,
        beforeSourceFormat, beforeContentSource, sourceFormat, contentSource, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'old-change',
        'human:old',
        'world-1',
        'doc-a',
        'update',
        JSON.stringify({ id: 'doc-a', revision: 1 }),
        JSON.stringify({ id: 'doc-a', revision: 2 }),
        'markdown',
        '# Before',
        'markdown',
        '# After',
        'old edit'
      ]
    )

    await runAppSchemaMigrations(dataSource)

    const migrated = await dataSource.getRepository(WorldDocumentChangeRecord).findOneByOrFail({
      id: 'old-change'
    })
    assert.ok(migrated.beforeContentVersionId)
    assert.ok(migrated.afterContentVersionId)
    assert.equal(migrated.beforeContentSource, null)
    assert.equal(migrated.contentSource, null)
    const schemaDiff = await dataSource.driver.createSchemaBuilder().log()
    assert.equal(schemaDiff.upQueries.length, 0)
  } finally {
    await dataSource.destroy()
  }
})
