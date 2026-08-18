import assert from 'node:assert/strict'

type ProcessResult = {
  error?: Error
  status: number | null
  signal: NodeJS.Signals | null
  stderr: string | Buffer | null
  stdout: string | Buffer | null
}

export const assertProcessTerminatedAbruptly = (result: ProcessResult): void => {
  assert.equal(result.error, undefined)
  assert.ok(
    result.signal !== null || (result.status !== null && result.status !== 0),
    String(result.stderr || result.stdout || 'Worker exited normally instead of crashing.')
  )
}
