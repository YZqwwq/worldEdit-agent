import assert from 'node:assert/strict'
import test from 'node:test'
import { DataSource } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import {
  commitWorldDocumentChangeSetWithManager,
  restoreWorldDocumentCommitWithManager,
  stageWorldDocumentChangeWithManager
} from '../../../worldbuilding/worldDocumentVersionService'
import { buildWorldDocumentContentDiff } from '../../../worldbuilding/worldDocumentDiffService'

const sqliteTest = (name: string, execute: () => Promise<void>): void => {
  test(name, { skip: process.env.RUN_DOCUMENT_VERSION_SQLITE_TESTS !== '1' }, execute)
}

type TreeEntry = {
  documentId: string
  title: string
  contentVersionId: string
  childrenTreeHash: string | null
}

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: true,
    entities: [
      WorldEntityDocumentRecord,
      WorldDocumentContentVersionRecord,
      WorldDocumentTreeObjectRecord,
      WorldDocumentCommitRecord,
      WorldDocumentChangeRecord
    ]
  })
  await dataSource.initialize()
  return dataSource
}

const documentState = (
  id: string,
  input: Partial<WorldEntityDocumentRecord> = {}
): Partial<WorldEntityDocumentRecord> => ({
  id,
  ownerKind: 'world',
  worldId: 'world-1',
  ownerEntityId: null,
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
    diff.lines.filter((line) => line.kind !== 'context'),
    [
      { kind: 'removed', text: '旧内容' },
      { kind: 'added', text: '新内容' }
    ]
  )
})

test('editor HTML history is converted only for readable Diff presentation', () => {
  const diff = buildWorldDocumentContentDiff(
    { format: 'html_editor', content: '<h1>标题</h1><p>旧内容</p>' },
    { format: 'html_editor', content: '<h1>标题</h1><p>新内容</p>' }
  )
  assert.ok(diff)
  assert.ok(diff.lines.every((line) => !line.text.includes('<h1>')))
  assert.equal(diff.addedLines, 1)
  assert.equal(diff.removedLines, 1)
})

sqliteTest('a staged content edit creates a baseline and one immutable world commit', async () => {
  const dataSource = await createDataSource()
  try {
    const documents = dataSource.getRepository(WorldEntityDocumentRecord)
    const original = await documents.save(documents.create(documentState('doc-a')))
    const before = documents.create({ ...original })
    original.contentHtml = '<h1>Runtime rendering</h1>'
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
    assert.equal(changes[0].contentSource, '<p>第一段完成</p>')
    assert.equal(changes[0].status, 'committed')
  } finally {
    await dataSource.destroy()
  }
})
