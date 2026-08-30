import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { AppDataSource, initDatabase } from '../../../../database'
import { Message } from '@share/entity/database/Message'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { aiService } from '../../aiService'
import { modelConfigService } from '../../../modelconfig/modelConfigService'

const TEST_SESSION_ID = process.env.WORLDEDIT_AGENT_TEST_SESSION_ID || 'model-integration-test'

const main = async (): Promise<void> => {
  if (process.env.RUN_MODEL_INTEGRATION_TESTS !== '1') {
    console.log('Model integration smoke test skipped. Set RUN_MODEL_INTEGRATION_TESTS=1 to run it.')
    return
  }

  await initDatabase()
  const options = await modelConfigService.getModelOptions()
  if (!options.apiKey?.trim()) {
    throw new Error('Model integration test requires a non-empty API key in the application database.')
  }
  if (!options.model?.trim()) {
    throw new Error('Model integration test requires a model in the application database.')
  }

  const requestId = `model-integration-${randomUUID()}`
  const content = '[MODEL-INTEGRATION-TEST] 请用一句中文确认你已收到这条测试消息。'

  let streamedChunkCount = 0
  await aiService.sendStreamMessage({ text: content, requestId }, () => {
    streamedChunkCount += 1
  })

  const messageRepo = AppDataSource.getRepository(Message)
  const eventRepo = AppDataSource.getRepository(MainAgentEventRecord)
  const turnRepo = AppDataSource.getRepository(MainAgentTurnRecord)
  const saved = await messageRepo.findOneBy({ requestId })
  assert.ok(saved?.eventId, 'test user message should be attached to an event')
  assert.equal(saved.sessionId, TEST_SESSION_ID)
  const event = await eventRepo.findOneBy({ id: saved.eventId })
  assert.equal(event?.sessionId, TEST_SESSION_ID)
  assert.equal(event?.status, 'completed')
  const turn = await turnRepo.findOneBy({ eventId: saved.eventId })
  assert.equal(turn?.sessionId, TEST_SESSION_ID)
  assert.equal(turn?.status, 'completed')
  assert.ok(turn?.aiMessageId, 'completed test turn should produce an AI message')
  const aiMessage = await messageRepo.findOneBy({ id: turn.aiMessageId! })
  assert.ok(aiMessage?.content?.trim(), 'completed test turn should contain a final response')
  console.log(
    JSON.stringify({
      sessionId: TEST_SESSION_ID,
      eventId: saved.eventId,
      turnId: turn.id,
      responseLength: aiMessage?.content.length ?? 0,
      streamedChunkCount,
      model: options.model,
      baseURL: options.baseURL ?? null
    })
  )
}

void main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
    app.quit()
  })
