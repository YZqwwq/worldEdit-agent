import assert from 'node:assert/strict'
import test from 'node:test'
import { SerialSaveCoordinator } from '../../../../../renderer/src/services/serialSaveCoordinator'

type Snapshot = {
  signature: string
  content: string
}

const deferred = <T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('concurrent save requests share the active persistence operation', async () => {
  const coordinator = new SerialSaveCoordinator<Snapshot>()
  const gate = deferred()
  let current = { signature: 'v1', content: 'first' }
  let savedSignature = ''
  let persistCalls = 0
  const request = {
    mode: 'once' as const,
    readSnapshot: () => ({ ...current }),
    isSaved: (snapshot: Snapshot) => snapshot.signature === savedSignature,
    persist: async (snapshot: Snapshot) => {
      persistCalls += 1
      await gate.promise
      savedSignature = snapshot.signature
    }
  }

  const first = coordinator.request(request)
  const second = coordinator.request(request)
  await Promise.resolve()
  assert.equal(coordinator.isSaving, true)
  assert.equal(persistCalls, 1)

  gate.resolve()
  await Promise.all([first, second])
  assert.equal(persistCalls, 1)
  assert.equal(savedSignature, current.signature)
  assert.equal(coordinator.isSaving, false)
})
test('flush persists edits that arrive while an earlier save is running', async () => {
  const coordinator = new SerialSaveCoordinator<Snapshot>()
  const firstSaveGate = deferred()
  let current = { signature: 'v1', content: 'first' }
  let savedSignature = ''
  const persisted: string[] = []
  const request = {
    readSnapshot: () => ({ ...current }),
    isSaved: (snapshot: Snapshot) => snapshot.signature === savedSignature,
    persist: async (snapshot: Snapshot) => {
      persisted.push(snapshot.signature)
      if (snapshot.signature === 'v1') await firstSaveGate.promise
      savedSignature = snapshot.signature
    }
  }

  const autosave = coordinator.request({ ...request, mode: 'once' })
  await Promise.resolve()
  current = { signature: 'v2', content: 'second' }
  const flush = coordinator.request({ ...request, mode: 'flush' })

  firstSaveGate.resolve()
  await Promise.all([autosave, flush])
  assert.deepEqual(persisted, ['v1', 'v2'])
  assert.equal(savedSignature, 'v2')
})

test('a failed save leaves the snapshot dirty and allows a later retry', async () => {
  const coordinator = new SerialSaveCoordinator<Snapshot>()
  const current = { signature: 'v1', content: 'first' }
  let savedSignature = ''
  let shouldFail = true
  const request = {
    mode: 'flush' as const,
    readSnapshot: () => ({ ...current }),
    isSaved: (snapshot: Snapshot) => snapshot.signature === savedSignature,
    persist: async (snapshot: Snapshot) => {
      if (shouldFail) throw new Error('save failed')
      savedSignature = snapshot.signature
    }
  }

  await assert.rejects(coordinator.request(request), /save failed/)
  assert.equal(savedSignature, '')
  assert.equal(coordinator.isSaving, false)

  shouldFail = false
  await coordinator.request(request)
  assert.equal(savedSignature, current.signature)
})
