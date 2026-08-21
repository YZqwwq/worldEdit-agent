import assert from 'node:assert/strict'
import test from 'node:test'
import { DataSource } from 'typeorm'
import { WorldRecord } from '@share/entity/database/WorldRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { AgentWorldCognitionSpaceRecord } from '@share/entity/database/AgentWorldCognitionSpaceRecord'
import { AgentWorldCognitionNodeRecord } from '@share/entity/database/AgentWorldCognitionNodeRecord'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'
import {
  AgentWorldCognitionError,
  AgentWorldCognitionService
} from '../../../worldbuilding/agentWorldCognitionService'

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
