import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { AppDataSource, initDatabase } from '../../../../database'
import { Message } from '@share/entity/database/Message'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { aiService } from '../../aiService'
import { modelConfigService } from '../../../modelconfig/modelConfigService'
import { normalizeMainAgentUserInput } from '@share/cache/AItype/states/mainAgentMessageContent'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import { agentScenarioSchema, type AgentScenario } from '../scenarios/agentScenario'
import { resolveAgentMessageSource } from '../../runtime/agentTestIdentity'
import { loadCharacterReadingFixture } from '../support/characterReadingFixture'
import { characterImpressionService } from '../../../worldbuilding/characterImpressionService'

const TEST_SESSION_ID = process.env.WORLDEDIT_AGENT_TEST_SESSION_ID || 'model-integration-test'

const runTurn = async (
  scenarioTurn?: AgentScenario['turns'][number],
  turnDirectory?: string
): Promise<void> => {
  if (process.env.RUN_MODEL_INTEGRATION_TESTS !== '1') {
    console.log(
      'Model integration smoke test skipped. Set RUN_MODEL_INTEGRATION_TESTS=1 to run it.'
    )
    return
  }

  const options = await modelConfigService.getModelOptions()
  if (!options.apiKey?.trim()) {
    throw new Error(
      'Model integration test requires a non-empty API key in the application database.'
    )
  }
  if (!options.model?.trim()) {
    throw new Error('Model integration test requires a model in the application database.')
  }

  const requestId = `model-integration-${randomUUID()}`
  const inputFile = process.env.WORLDEDIT_AGENT_TEST_INPUT_FILE
  const input = normalizeMainAgentUserInput(
    scenarioTurn ??
      (inputFile
        ? JSON.parse(await readFile(inputFile, 'utf8'))
        : { text: '[MODEL-INTEGRATION-TEST] 请用一句中文确认你已收到这条测试消息。' })
  )
  const outputDirectory = turnDirectory ?? process.env.WORLDEDIT_AGENT_TEST_OUTPUT_DIR
  const traceRoot = process.env.WORLDEDIT_AGENT_TRACE_ROOT
  const traceFile = traceRoot ? join(traceRoot, 'agent-trace.jsonl') : undefined
  const traceOffset =
    traceFile && existsSync(traceFile) ? (await readFile(traceFile, 'utf8')).length : 0
  const chunks: StreamChunk[] = []
  const characterId = scenarioTurn?.workspaceContext?.entity?.id
  const beforeImpression = characterId
    ? await characterImpressionService.getImpression(characterId)
    : undefined

  let streamedChunkCount = 0
  try {
    await aiService.sendStreamMessage({ ...input, requestId }, (chunk) => {
      streamedChunkCount += 1
      chunks.push(chunk)
    })
  } finally {
    if (outputDirectory) {
      const directory = resolve(outputDirectory)
      await mkdir(directory, { recursive: true })
      if (characterId) {
        await writeFile(
          join(directory, 'impression-state.json'),
          JSON.stringify(
            {
              before: beforeImpression,
              after: await characterImpressionService.getImpression(characterId)
            },
            null,
            2
          ),
          'utf8'
        )
      }
      await writeFile(join(directory, 'stream.json'), JSON.stringify(chunks, null, 2), 'utf8')
      const traceRoot = process.env.WORLDEDIT_AGENT_TRACE_ROOT
      if (traceRoot && existsSync(traceRoot)) {
        await cp(traceRoot, join(directory, 'traces'), { recursive: true })
        for (const file of await readdir(traceRoot, { recursive: true })) {
          if (!/(?:cognition-prompt-step-\d+|expression-prompt-[\w-]+)\.json$/.test(file)) continue
          const capture = JSON.parse(await readFile(join(traceRoot, file), 'utf8'))
          const messages = capture.messages ?? capture.data?.messages
          if (!Array.isArray(messages)) continue
          await writeFile(
            join(directory, 'traces', `${file}.txt`),
            messages
              .map(
                (message, index) =>
                  `Message ${index + 1} (${message.type})\n${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`
              )
              .join('\n\n'),
            'utf8'
          )
        }
      }
      const thoughts = new Map<string, string>()
      for (const chunk of chunks) {
        if (chunk.type === 'agent_thought') thoughts.set(chunk.thoughtId, chunk.text)
      }
      await writeFile(
        join(directory, 'thoughts.txt'),
        [...thoughts.values()].join('\n\n---\n\n'),
        'utf8'
      )
      if (traceFile && existsSync(traceFile)) {
        const records = (await readFile(traceFile, 'utf8'))
          .slice(traceOffset)
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
        const tools = records.filter(
          (record) =>
            record.title?.startsWith('状态: toolNode 调用') ||
            record.title?.startsWith('产物: toolNode ')
        )
        await writeFile(
          join(directory, 'tools.txt'),
          tools
            .map(
              (record) =>
                `${record.title}\n${record.summary ?? ''}\n${record.data?.argsSummary ?? ''}\n${record.data?.resultSummary ?? ''}`
            )
            .join('\n\n'),
          'utf8'
        )
      }
    }
  }

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
  if (outputDirectory) {
    await writeFile(join(resolve(outputDirectory), 'response.txt'), aiMessage!.content, 'utf8')
    await writeFile(
      join(resolve(outputDirectory), 'turn.json'),
      JSON.stringify(
        {
          actor: resolveAgentMessageSource(),
          sessionId: TEST_SESSION_ID,
          eventId: saved.eventId,
          turnId: turn.id,
          model: options.model,
          streamedChunkCount
        },
        null,
        2
      ),
      'utf8'
    )
  }
  const expectedTools =
    scenarioTurn?.expect.successfulTools ??
    [process.env.WORLDEDIT_AGENT_TEST_EXPECT_TOOL].filter((name): name is string => Boolean(name))
  for (const expectedTool of expectedTools) {
    const traceRoot = process.env.WORLDEDIT_AGENT_TRACE_ROOT
    assert.ok(traceRoot, 'tool assertions require an isolated trace root')
    const records = (await readFile(join(traceRoot, 'agent-trace.jsonl'), 'utf8'))
      .slice(traceOffset)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const readIndex = records.findIndex(
      (record) => record.title === `产物: toolNode ${expectedTool} 返回` && record.data?.ok === true
    )
    assert.ok(readIndex >= 0, `${expectedTool} should actually succeed`)
    if (!scenarioTurn || scenarioTurn.expect.thoughtAfterTool)
      assert.ok(
        records
          .slice(readIndex + 1)
          .some(
            (record) =>
              record.node === 'cognitionNode' &&
              record.title === '产物: 推理文本' &&
              record.data?.followsObservation === true &&
              record.data?.chars > 0
          ),
        'cognition should continue after the tool observation'
      )
  }
  for (const text of scenarioTurn?.expect.responseIncludes ?? []) {
    assert.ok(aiMessage!.content.includes(text), `response should include ${text}`)
  }
  if (scenarioTurn?.expect.responseEquals !== undefined) {
    assert.equal(aiMessage!.content.trim(), scenarioTurn.expect.responseEquals, 'response should exactly match the requested output')
  }
  const thoughts = new Map<string, string>()
  for (const chunk of chunks)
    if (chunk.type === 'agent_thought') thoughts.set(chunk.thoughtId, chunk.text)
  for (const text of scenarioTurn?.expect.thoughtIncludes ?? []) {
    assert.ok([...thoughts.values()].join('\n').includes(text), `thought should include ${text}`)
  }
  if (scenarioTurn?.expect.toolArguments?.length) {
    assert.ok(traceFile)
    const records = (await readFile(traceFile, 'utf8'))
      .slice(traceOffset)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    for (const expected of scenarioTurn.expect.toolArguments) {
      assert.ok(
        records.some((record) => {
          if (record.title !== `产物: toolNode ${expected.name} 返回` || record.data?.ok !== true)
            return false
          try {
            const actual = JSON.parse(record.data.argsSummary)
            return Object.entries(expected.args).every(
              ([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value)
            )
          } catch {
            return false
          }
        }),
        `successful ${expected.name} should target the expected entity/document`
      )
    }
  }
  if (characterId) {
    const afterImpression = await characterImpressionService.getImpression(characterId)
    if (outputDirectory)
      await writeFile(
        join(resolve(outputDirectory), 'impression-state.json'),
        JSON.stringify({ before: beforeImpression, after: afterImpression }, null, 2),
        'utf8'
      )
    if (scenarioTurn?.expect.impressionUnchanged)
      assert.deepEqual(
        afterImpression,
        beforeImpression,
        'partial reading should not overwrite the saved impression'
      )
  } else if (scenarioTurn?.expect.impressionUnchanged)
    throw new Error('impressionUnchanged requires a character workspace entity')
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

const main = async (): Promise<void> => {
  if (process.env.RUN_MODEL_INTEGRATION_TESTS !== '1') return
  if (process.env.WORLDEDIT_AGENT_ISOLATE_APP_DATA !== '1')
    throw new Error('Real-model tests require isolation.')
  resolveAgentMessageSource()
  const file = process.env.WORLDEDIT_AGENT_TEST_SCENARIO
  const scenario = file
    ? agentScenarioSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    : undefined
  await initDatabase()
  if (!scenario) return runTurn()
  if (scenario.actor !== resolveAgentMessageSource())
    throw new Error('Scenario identity differs from runner identity.')
  const directory = resolve(
    'temp-plan',
    'agent-tests',
    scenario.id,
    `${Date.now()}-${randomUUID().slice(0, 8)}`
  )
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'scenario.json'), JSON.stringify(scenario, null, 2), 'utf8')
  const result: { status: string; completedTurns: number; error?: string } = {
    status: 'running',
    completedTurns: 0
  }
  try {
    if (scenario.environment.state === 'fresh') await aiService.resetAgentSession()
    const initialState = {
      actor: scenario.actor,
      environment: scenario.environment,
      messageCount: await AppDataSource.getRepository(Message).count(),
      documentCount: await AppDataSource.getRepository(WorldEntityDocumentRecord).count()
    }
    await writeFile(
      join(directory, 'initial-state.json'),
      JSON.stringify(initialState, null, 2),
      'utf8'
    )
    if (scenario.environment.state === 'fresh') assert.equal(initialState.messageCount, 0)
    if (scenario.environment.database === 'empty') assert.equal(initialState.documentCount, 0)
    if (scenario.environment.fixture) {
      const fixture = await loadCharacterReadingFixture(scenario.environment.fixture)
      await writeFile(join(directory, 'fixture.json'), JSON.stringify(fixture, null, 2), 'utf8')
    }
    for (const [index, turn] of scenario.turns.entries()) {
      await runTurn(turn, join(directory, `turn-${index + 1}`))
      result.completedTurns += 1
    }
    result.status = 'passed'
  } catch (error) {
    result.status = 'failed'
    result.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log(`Scenario artifacts: ${directory}`)
  }
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
