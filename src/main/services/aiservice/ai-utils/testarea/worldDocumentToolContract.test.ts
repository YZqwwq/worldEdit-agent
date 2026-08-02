import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorldDocumentInputSchema,
  listWorldDocumentsInputSchema
} from '../tools/document/worldDocumentToolContracts'

test('document catalog input uses flat world and entity references', () => {
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a',
      entityId: 'entity-a'
    }).success,
    true
  )
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a'
    }).success,
    true
  )
})

test('legacy nested owner input is not part of the agent-facing contract', () => {
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      owner: {
        kind: 'entity',
        worldId: 'world-a',
        entityId: 'entity-a'
      }
    }).success,
    false
  )
})

test('document creation follows the same flat owner contract', () => {
  assert.equal(
    createWorldDocumentInputSchema.safeParse({
      worldId: 'world-a',
      entityId: 'entity-a',
      title: '人物志'
    }).success,
    true
  )
})
