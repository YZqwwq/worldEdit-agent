import assert from 'node:assert/strict'
import test from 'node:test'
import { DataSource } from 'typeorm'
import { WorldRecord } from '@share/entity/database/WorldRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { AgentWorldCognitionSpaceRecord } from '@share/entity/database/AgentWorldCognitionSpaceRecord'
import { AgentWorldCognitionNodeRecord } from '@share/entity/database/AgentWorldCognitionNodeRecord'
import { WorldEntityRecord } from '@share/entity/database/WorldEntityRecord'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'
import {
  AgentWorldCognitionError,
  AgentWorldCognitionService
} from '../../../worldbuilding/agentWorldCognitionService'
import { CharacterNarrativeReadingService } from '../../../worldbuilding/characterNarrativeReadingService'

const sqliteTest = (name: string, execute: () => Promise<void>): void => {
  test(name, { skip: process.env.RUN_WORLD_COGNITION_SQLITE_TESTS !== '1' }, execute)
}

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    entities: [
      WorldRecord,
      WorldEntityDocumentRecord,
      WorldEntityRecord,
      AgentWorldCognitionSpaceRecord,
      AgentWorldCognitionNodeRecord
    ]
  })
  await dataSource.initialize()
  await runAppSchemaMigrations(dataSource)
  return dataSource
}

sqliteTest('Agent world cognition persists free dimensions and finds concept aliases', async () => {
  const dataSource = await createDataSource()
  try {
    await dataSource.getRepository(WorldRecord).save({
      id: 'world-a',
      name: '世界 A',
      summary: '',
      status: 'active',
      schemaVersion: 1
    })
    await dataSource.getRepository(WorldEntityDocumentRecord).save({
      id: 'document-a',
      worldId: 'world-a',
      parentDocumentId: null,
      title: '李青岚',
      contentHtml: '<p>李青岚也被称为青岚。</p>',
      contentFormat: 'html',
      sortKey: 'a',
      revision: 3,
      schemaVersion: 1
    })
    const service = new AgentWorldCognitionService(dataSource)
    const dimension = await service.saveNode({
      agentId: 'main-agent',
      worldId: 'world-a',
      parentId: null,
      nodeKind: 'dimension',
      title: '人物',
      markdown: '# 人物\n\n收录具有独立身份的角色。',
      documentRefs: []
    })
    const concept = await service.saveNode({
      agentId: 'main-agent',
      worldId: 'world-a',
      parentId: dimension.node.id,
      nodeKind: 'concept',
      title: '李青岚',
      markdown: '# 李青岚\n\n- 别称：青岚\n- 主要文档：李青岚',
      documentRefs: [{ documentId: 'document-a', revision: 3 }]
    })

    assert.equal(dimension.node.nodeKind, 'dimension')
    assert.equal(concept.node.parentTitle, '人物')
    assert.equal(concept.spaceRevision, 2)
    const queried = await service.queryNodes({
      agentId: 'main-agent',
      worldId: 'world-a',
      query: '青岚'
    })
    assert.equal(queried.matches.length, 1)
    assert.equal(queried.matches[0].id, concept.node.id)
    assert.deepEqual(queried.matches[0].documentRefs, [{ documentId: 'document-a', revision: 3 }])
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('Agent and world scopes isolate cognition with the same title', async () => {
  const dataSource = await createDataSource()
  try {
    await dataSource.getRepository(WorldRecord).save([
      { id: 'world-a', name: '世界 A', summary: '', status: 'active', schemaVersion: 1 },
      { id: 'world-b', name: '世界 B', summary: '', status: 'active', schemaVersion: 1 }
    ])
    const service = new AgentWorldCognitionService(dataSource)
    await service.saveNode({
      agentId: 'main-agent',
      worldId: 'world-a',
      parentId: null,
      nodeKind: 'dimension',
      title: '人物',
      markdown: '# 人物\n\n世界 A 的人物组织方式。',
      documentRefs: []
    })
    const wrongWorld = await service.queryNodes({
      agentId: 'main-agent',
      worldId: 'world-b',
      query: '人物'
    })
    const wrongAgent = await service.queryNodes({
      agentId: 'other-agent',
      worldId: 'world-a',
      query: '人物'
    })
    assert.equal(wrongWorld.matches.length, 0)
    assert.equal(wrongAgent.matches.length, 0)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'document revision and deletion atomically mark source cognition for review',
  async () => {
    const dataSource = await createDataSource()
    try {
      await dataSource.getRepository(WorldRecord).save({
        id: 'world-a',
        name: '世界 A',
        summary: '',
        status: 'active',
        schemaVersion: 1
      })
      await dataSource.getRepository(WorldEntityDocumentRecord).save([
        {
          id: 'document-a',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '文档 A',
          contentHtml: '<p>A</p>',
          contentFormat: 'html',
          sortKey: 'a',
          revision: 1,
          schemaVersion: 1
        },
        {
          id: 'document-b',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '文档 B',
          contentHtml: '<p>B</p>',
          contentFormat: 'html',
          sortKey: 'b',
          revision: 1,
          schemaVersion: 1
        }
      ])
      const service = new AgentWorldCognitionService(dataSource)
      const dimension = await service.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: null,
        nodeKind: 'dimension',
        title: '设定',
        markdown: '# 设定',
        documentRefs: []
      })
      const conceptA = await service.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: dimension.node.id,
        nodeKind: 'concept',
        title: '概念 A',
        markdown: '# 概念 A\n\n来源于文档 A。',
        documentRefs: [{ documentId: 'document-a', revision: 1 }]
      })
      const conceptB = await service.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: dimension.node.id,
        nodeKind: 'concept',
        title: '概念 B',
        markdown: '# 概念 B\n\n来源于文档 B。',
        documentRefs: [{ documentId: 'document-b', revision: 1 }]
      })

      await dataSource
        .getRepository(AgentWorldCognitionNodeRecord)
        .update({ id: dimension.node.id }, { documentRefsJson: '{broken-json' })
      await dataSource
        .getRepository(WorldEntityDocumentRecord)
        .update({ id: 'document-a' }, { contentHtml: '<p>A2</p>', revision: 2 })
      await dataSource.getRepository(WorldEntityDocumentRecord).delete({ id: 'document-b' })

      const staleA = await service.queryNodes({
        agentId: 'main-agent',
        worldId: 'world-a',
        query: '概念 A'
      })
      const staleB = await service.queryNodes({
        agentId: 'main-agent',
        worldId: 'world-a',
        query: '概念 B'
      })
      assert.equal(staleA.matches[0].status, 'needs_review')
      assert.equal(staleA.matches[0].revision, conceptA.node.revision + 1)
      assert.equal(staleB.matches[0].status, 'needs_review')
      assert.equal(staleB.matches[0].revision, conceptB.node.revision + 1)
      assert.equal(staleB.spaceRevision, 5)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest('cognition and source document revisions reject stale writes', async () => {
  const dataSource = await createDataSource()
  try {
    await dataSource.getRepository(WorldRecord).save({
      id: 'world-a',
      name: '世界 A',
      summary: '',
      status: 'active',
      schemaVersion: 1
    })
    await dataSource.getRepository(WorldEntityDocumentRecord).save({
      id: 'document-a',
      worldId: 'world-a',
      parentDocumentId: null,
      title: '文档',
      contentHtml: '<p>内容</p>',
      contentFormat: 'html',
      sortKey: 'a',
      revision: 2,
      schemaVersion: 1
    })
    const service = new AgentWorldCognitionService(dataSource)
    const dimension = await service.saveNode({
      agentId: 'main-agent',
      worldId: 'world-a',
      parentId: null,
      nodeKind: 'dimension',
      title: '自由维度',
      markdown: '# 自由维度',
      documentRefs: []
    })

    await assert.rejects(
      service.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: dimension.node.id,
        nodeKind: 'concept',
        title: '旧证据',
        markdown: '# 旧证据',
        documentRefs: [{ documentId: 'document-a', revision: 1 }]
      }),
      (error: unknown) =>
        error instanceof AgentWorldCognitionError && error.code === 'DOCUMENT_REVISION_CONFLICT'
    )
    await assert.rejects(
      service.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        nodeId: dimension.node.id,
        expectedRevision: 2,
        parentId: null,
        nodeKind: 'dimension',
        title: '自由维度',
        markdown: '# 自由维度\n\n更新。',
        documentRefs: []
      }),
      (error: unknown) =>
        error instanceof AgentWorldCognitionError && error.code === 'NODE_REVISION_CONFLICT'
    )
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'character narrative reading uses only the available cognition document scope',
  async () => {
    const dataSource = await createDataSource()
    try {
      await dataSource.getRepository(WorldRecord).save({
        id: 'world-a',
        name: '世界 A',
        summary: '',
        status: 'active',
        schemaVersion: 1
      })
      await dataSource.getRepository(WorldEntityRecord).save({
        id: 'character-a',
        worldId: 'world-a',
        type: 'character',
        name: '李青岚',
        slug: 'li-qing-lan',
        title: '',
        summary: '',
        status: 'active',
        schemaVersion: 1
      })
      await dataSource.getRepository(WorldEntityDocumentRecord).save([
        {
          id: 'character-document',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '李青岚人物志',
          contentHtml: '<p>青岚在北境成长。</p>',
          contentFormat: 'html',
          sortKey: 'a',
          revision: 1,
          schemaVersion: 1
        },
        {
          id: 'unrelated-document',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '南方贸易统计',
          contentHtml: '<p>这份文档与李青岚无关，也不应被人物阅读工具加载。</p>',
          contentFormat: 'html',
          sortKey: 'b',
          revision: 1,
          schemaVersion: 1
        }
      ])
      const cognition = new AgentWorldCognitionService(dataSource)
      const dimension = await cognition.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: null,
        nodeKind: 'dimension',
        title: '人物',
        markdown: '# 人物',
        documentRefs: []
      })
      await cognition.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: dimension.node.id,
        nodeKind: 'concept',
        title: '李青岚',
        markdown: '# 李青岚\n\n- 别称：青岚',
        documentRefs: [{ documentId: 'character-document', revision: 1 }]
      })

      const reading = new CharacterNarrativeReadingService(dataSource)
      const catalog = await reading.inspectCatalog({
        characterEntityId: 'character-a',
        includePreview: true
      })
      assert.equal(catalog.cognitionScope.status, 'available')
      assert.equal(catalog.totalDocuments, 1)
      assert.deepEqual(
        catalog.selectableItems
          .filter((item) => item.type === 'document')
          .map((item) => item.documentId),
        ['character-document']
      )
      assert.doesNotMatch(JSON.stringify(catalog), /南方贸易统计|与李青岚无关/)

      await dataSource
        .getRepository(WorldEntityDocumentRecord)
        .update(
          { id: 'unrelated-document' },
          { contentHtml: '<p>无关文档的新内容。</p>', revision: 2 }
        )
      const afterUnrelatedUpdate = await reading.inspectCatalog({
        characterEntityId: 'character-a'
      })
      assert.equal(afterUnrelatedUpdate.cognitionScope.status, 'available')
      assert.equal(afterUnrelatedUpdate.totalDocuments, 1)

      const task = await reading.createReadingTask({
        characterEntityId: 'character-a',
        mission: '形成对人物的整体认识',
        mode: 'full'
      })
      assert.deepEqual(task.units[0].documentIds, ['character-document'])
      const batch = await reading.readTaskBatch({ task })
      assert.equal(batch.chunks.length, 1)
      assert.match(batch.chunks[0].text, /青岚在北境成长/)

      await dataSource
        .getRepository(WorldEntityDocumentRecord)
        .update({ id: 'character-document' }, { contentHtml: '<p>新内容</p>', revision: 2 })
      const staleCatalog = await reading.inspectCatalog({ characterEntityId: 'character-a' })
      assert.equal(staleCatalog.cognitionScope.status, 'needs_review')
      assert.equal(staleCatalog.totalDocuments, 0)
      await assert.rejects(reading.readTaskBatch({ task }), /人物认知范围在阅读任务创建后发生变化/)
    } finally {
      await dataSource.destroy()
    }
  }
)

sqliteTest(
  'character narrative reading never falls back to the whole world on missing or ambiguous cognition',
  async () => {
    const dataSource = await createDataSource()
    try {
      await dataSource.getRepository(WorldRecord).save({
        id: 'world-a',
        name: '世界 A',
        summary: '',
        status: 'active',
        schemaVersion: 1
      })
      await dataSource.getRepository(WorldEntityRecord).save({
        id: 'character-a',
        worldId: 'world-a',
        type: 'character',
        name: '同名人物',
        slug: 'same-name',
        title: '',
        summary: '',
        status: 'active',
        schemaVersion: 1
      })
      await dataSource.getRepository(WorldEntityDocumentRecord).save([
        {
          id: 'document-a',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '文档 A',
          contentHtml: '<p>A</p>',
          contentFormat: 'html',
          sortKey: 'a',
          revision: 1,
          schemaVersion: 1
        },
        {
          id: 'document-b',
          worldId: 'world-a',
          parentDocumentId: null,
          title: '文档 B',
          contentHtml: '<p>B</p>',
          contentFormat: 'html',
          sortKey: 'b',
          revision: 1,
          schemaVersion: 1
        }
      ])
      const reading = new CharacterNarrativeReadingService(dataSource)
      const missing = await reading.inspectCatalog({ characterEntityId: 'character-a' })
      assert.equal(missing.cognitionScope.status, 'missing')
      assert.equal(missing.totalDocuments, 0)
      await assert.rejects(
        reading.createReadingTask({
          characterEntityId: 'character-a',
          mission: '认识人物',
          mode: 'full'
        }),
        /尚未建立人物“同名人物”的世界认知卡片/
      )

      const cognition = new AgentWorldCognitionService(dataSource)
      const dimension = await cognition.saveNode({
        agentId: 'main-agent',
        worldId: 'world-a',
        parentId: null,
        nodeKind: 'dimension',
        title: '人物',
        markdown: '# 人物',
        documentRefs: []
      })
      for (const [documentId, suffix] of [
        ['document-a', '甲'],
        ['document-b', '乙']
      ] as const) {
        await cognition.saveNode({
          agentId: 'main-agent',
          worldId: 'world-a',
          parentId: dimension.node.id,
          nodeKind: 'concept',
          title: '同名人物',
          markdown: `# 同名人物\n\n候选${suffix}`,
          documentRefs: [{ documentId, revision: 1 }]
        })
      }
      const ambiguous = await reading.inspectCatalog({ characterEntityId: 'character-a' })
      assert.equal(ambiguous.cognitionScope.status, 'ambiguous')
      assert.equal(ambiguous.cognitionScope.candidates.length, 2)
      assert.equal(ambiguous.totalDocuments, 0)
    } finally {
      await dataSource.destroy()
    }
  }
)
