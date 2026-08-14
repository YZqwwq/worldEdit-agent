import assert from 'node:assert/strict'
import test from 'node:test'
import { DataSource } from 'typeorm'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { runWithToolEffectExecutionContext } from '../../toolEffects/toolEffectExecutionContext'
import {
  findCompletedToolEffectByCallId,
  listToolEffectsByCallId,
  planToolEffect,
  persistCompletedToolEffects,
  reconcileOrphanedPlannedToolEffects,
  persistPlannedToolEffect,
  persistCompletedToolEffect,
  settleOpenToolEffectsForCall,
  settleToolEffect
} from '../../toolEffects/toolEffectReceiptService'
import {
  getToolChangeSetSummary,
  resolveToolChangeSetOutcome,
  sealTurnChangeSetWithManager
} from '../../toolEffects/toolChangeSetService'

const sqliteTest = (name: string, execute: () => Promise<void>): void => {
  test(name, { skip: process.env.RUN_TOOL_EFFECT_SQLITE_TESTS !== '1' }, execute)
}

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: true,
    entities: [
      WorldEntityDocumentRecord,
      MainAgentToolEffectReceiptRecord,
      MainAgentChangeSetRecord
    ]
  })
  await dataSource.initialize()
  return dataSource
}

const createDocument = (id: string): Partial<WorldEntityDocumentRecord> => ({
  id,
  ownerKind: 'world',
  worldId: 'world-1',
  ownerEntityId: null,
  parentDocumentId: null,
  title: '测试文档',
  contentHtml: '<p>内容</p>',
  contentFormat: 'html',
  sortKey: 'a',
  revision: 1,
  schemaVersion: 1
})

sqliteTest('business mutation and completed effect receipt commit in one transaction', async () => {
  const dataSource = await createDataSource()
  try {
    const context = {
      eventId: 'event-1',
      turnId: 7,
      changeSetId: 'turn:7',
      sessionId: 'default',
      toolCallId: 'tool-call-1',
      toolName: 'create_world_document',
      recoveryMode: 'same_database_transaction' as const
    }
    const planned = await persistPlannedToolEffect(dataSource, context)
    await runWithToolEffectExecutionContext(context, () =>
      dataSource.transaction(async (manager) => {
        await manager.getRepository(WorldEntityDocumentRecord).save(createDocument('doc-1'))
        await persistCompletedToolEffect(manager, {
          operation: '创建世界观文档',
          subject: { type: 'document', id: 'doc-1', label: '测试文档' },
          afterRevision: 1,
          summary: '创建测试文档',
          evidenceRef: 'document:doc-1',
          payload: { documentId: 'doc-1', revision: 1 }
        })
      })
    )

    assert.ok(await dataSource.getRepository(WorldEntityDocumentRecord).findOneBy({ id: 'doc-1' }))
    const receipt = await findCompletedToolEffectByCallId(dataSource, {
      eventId: 'event-1',
      turnId: 7,
      toolCallId: 'tool-call-1'
    })
    assert.equal(receipt?.changeSetId, 'turn:7')
    assert.equal(receipt?.id, planned.receipt.id)
    assert.equal(receipt?.subject.id, 'doc-1')
    assert.equal(receipt?.afterRevision, 1)
    assert.deepEqual(receipt?.payload, { documentId: 'doc-1', revision: 1 })
    const openChangeSet = await getToolChangeSetSummary(dataSource, 'turn:7')
    assert.equal(openChangeSet?.lifecycle, 'open')
    assert.equal(openChangeSet?.outcome, 'completed')
    assert.deepEqual(openChangeSet?.subjectTypes, ['document'])
    await dataSource.transaction((manager) => sealTurnChangeSetWithManager(manager, 'event-1', 7))
    assert.equal((await getToolChangeSetSummary(dataSource, 'turn:7'))?.lifecycle, 'sealed')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'receipt failure rolls back the business mutation with the same transaction',
  async () => {
    const dataSource = await createDataSource()
    try {
      const context = {
        eventId: 'event-2',
        turnId: 8,
        changeSetId: 'turn:8',
        sessionId: 'default',
        toolCallId: 'tool-call-2',
        toolName: 'create_world_document',
        recoveryMode: 'same_database_transaction' as const
      }
      await persistPlannedToolEffect(dataSource, context)
      await assert.rejects(
        runWithToolEffectExecutionContext(context, () =>
          dataSource.transaction(async (manager) => {
            await manager.getRepository(WorldEntityDocumentRecord).save(createDocument('doc-2'))
            await persistCompletedToolEffect(manager, {
              operation: '创建世界观文档',
              subject: { type: 'document', id: 'doc-2' },
              afterRevision: 1,
              summary: '创建后模拟事务失败'
            })
            throw new Error('force rollback')
          })
        ),
        /force rollback/
      )

      assert.equal(
        await dataSource.getRepository(WorldEntityDocumentRecord).findOneBy({ id: 'doc-2' }),
        null
      )
      const plannedAfterRollback = await dataSource
        .getRepository(MainAgentToolEffectReceiptRecord)
        .findOneBy({ toolCallId: 'tool-call-2' })
      assert.equal(plannedAfterRollback?.status, 'planned')

      await persistPlannedToolEffect(dataSource, {
        eventId: 'event-3',
        turnId: 9,
        changeSetId: 'turn:9',
        sessionId: 'default',
        toolCallId: 'tool-call-3',
        toolName: 'external_side_effect',
        recoveryMode: 'best_effort'
      })
      assert.deepEqual(await reconcileOrphanedPlannedToolEffects(dataSource), {
        failed: 1,
        unknown: 1
      })
      const failedAfterRestart = await dataSource
        .getRepository(MainAgentToolEffectReceiptRecord)
        .findOneBy({ toolCallId: 'tool-call-2' })
      assert.equal(failedAfterRestart?.status, 'failed')
      const unknownAfterRestart = await dataSource
        .getRepository(MainAgentToolEffectReceiptRecord)
        .findOneBy({ toolCallId: 'tool-call-3' })
      assert.equal(unknownAfterRestart?.status, 'unknown')
      assert.equal(
        await findCompletedToolEffectByCallId(dataSource, {
          eventId: 'event-2',
          turnId: 8,
          toolCallId: 'tool-call-2'
        }),
        null
      )
    } finally {
      await dataSource.destroy()
    }
  }
)

test('non-agent writes do not touch receipt persistence', async () => {
  const manager = {
    getRepository: () => {
      throw new Error('repository must not be accessed without an Agent tool context')
    }
  }
  const persisted = await persistCompletedToolEffect(manager as never, {
    operation: '普通应用写入',
    subject: { type: 'document', id: 'doc-3' },
    summary: '不属于 Agent 工具调用'
  })
  assert.equal(persisted, null)
})

test('change set outcome is derived without resource-specific rules', () => {
  assert.equal(
    resolveToolChangeSetOutcome({ planned: 0, completed: 2, failed: 0, aborted: 0, unknown: 0 }),
    'completed'
  )
  assert.equal(
    resolveToolChangeSetOutcome({ planned: 0, completed: 2, failed: 1, aborted: 0, unknown: 0 }),
    'partial'
  )
  assert.equal(
    resolveToolChangeSetOutcome({ planned: 0, completed: 2, failed: 0, aborted: 0, unknown: 1 }),
    'unknown'
  )
})

sqliteTest('one tool call can aggregate independent effects for new resource types', async () => {
  const dataSource = await createDataSource()
  try {
    const context = {
      eventId: 'event-multi',
      turnId: 10,
      changeSetId: 'turn:10',
      sessionId: 'default',
      toolCallId: 'tool-call-multi',
      toolName: 'edit_world_assets',
      recoveryMode: 'same_database_transaction' as const
    }
    await persistPlannedToolEffect(dataSource, context)
    await runWithToolEffectExecutionContext(context, () =>
      dataSource.transaction((manager) =>
        persistCompletedToolEffects(manager, [
          {
            effectKey: 'document:doc-1',
            operation: '更新文档',
            subject: { type: 'document', id: 'doc-1' },
            beforeRevision: 1,
            afterRevision: 2,
            summary: '更新文档正文'
          },
          {
            effectKey: 'image:image-1',
            operation: '替换图片',
            subject: { type: 'image', id: 'image-1' },
            beforeRef: 'sha256:old',
            afterRef: 'sha256:new',
            resultRef: 'asset:sha256:new',
            summary: '替换角色立绘'
          },
          {
            effectKey: 'map:map-1',
            operation: '更新地图',
            subject: { type: 'map', id: 'map-1' },
            diffRef: 'diff:map-1:2',
            summary: '更新地图节点'
          }
        ])
      )
    )

    const summary = await getToolChangeSetSummary(dataSource, 'turn:10')
    assert.equal(summary?.effectCount, 3)
    assert.equal(summary?.outcome, 'completed')
    assert.deepEqual(summary?.subjectTypes, ['document', 'image', 'map'])
    assert.equal(
      await dataSource.getRepository(MainAgentToolEffectReceiptRecord).countBy({
        toolCallId: 'tool-call-multi'
      }),
      3
    )
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest(
  'non-atomic child effects settle independently without a synthetic primary effect',
  async () => {
    const dataSource = await createDataSource()
    try {
      const context = {
        eventId: 'event-external-multi',
        turnId: 11,
        changeSetId: 'turn:11',
        sessionId: 'default',
        toolCallId: 'tool-call-external-multi',
        toolName: 'publish_world_assets',
        recoveryMode: 'best_effort' as const
      }
      await persistPlannedToolEffect(dataSource, context)
      await runWithToolEffectExecutionContext(context, async () => {
        const imagePlan = await planToolEffect(dataSource, {
          effectKey: 'image:image-2',
          operation: '上传图片',
          subject: { type: 'image', id: 'image-2' }
        })
        assert.equal(imagePlan?.created, true)
        assert.equal(imagePlan?.receipt.id !== undefined, true)
        assert.equal(
          (
            await planToolEffect(dataSource, {
              effectKey: 'image:image-2',
              operation: '上传图片',
              subject: { type: 'image', id: 'image-2' }
            })
          )?.created,
          false
        )
        await settleToolEffect(dataSource, {
          effectKey: 'image:image-2',
          status: 'completed',
          operation: '上传图片',
          subject: { type: 'image', id: 'image-2' },
          afterRef: 'sha256:image-2',
          summary: '图片上传完成'
        })
        await planToolEffect(dataSource, {
          effectKey: 'map:map-2',
          operation: '发布地图',
          subject: { type: 'map', id: 'map-2' }
        })
      })

      await settleOpenToolEffectsForCall(dataSource, context, {
        status: 'unknown',
        summary: '工具在地图发布确认前异常结束'
      })
      const effects = await listToolEffectsByCallId(dataSource, context)
      assert.equal(effects.length, 2)
      assert.deepEqual(
        effects.map((effect) => [effect.effectKey, effect.status]),
        [
          ['image:image-2', 'completed'],
          ['map:map-2', 'unknown']
        ]
      )
      assert.equal(
        (await getToolChangeSetSummary(dataSource, context.changeSetId))?.outcome,
        'unknown'
      )

      await settleToolEffect(
        dataSource,
        {
          effectKey: 'map:map-2',
          status: 'completed',
          operation: '发布地图',
          subject: { type: 'map', id: 'map-2' },
          resultRef: 'map-release:map-2:v3',
          summary: '重启后向地图服务核验为发布成功'
        },
        context
      )
      assert.equal(
        (await getToolChangeSetSummary(dataSource, context.changeSetId))?.outcome,
        'completed'
      )
    } finally {
      await dataSource.destroy()
    }
  }
)
