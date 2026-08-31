import { readFile, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { initDatabase, AppDataSource } from '../../../../database'
import { modelConfigService } from '../../../modelconfig/modelConfigService'
import { createConfiguredModelRuntime } from '../../model-adapters/modelProviderAdapter'

type CapturedMessage = {
  type?: string
  content?: unknown
  additional_kwargs?: Record<string, unknown>
}

const toMessage = (message: CapturedMessage) => {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')
  const kwargs = message.additional_kwargs ?? {}
  if (message.type === 'HumanMessage') return new HumanMessage({ content, additional_kwargs: kwargs })
  if (message.type === 'ToolMessage') return new ToolMessage({ content, additional_kwargs: kwargs, tool_call_id: String(kwargs.tool_call_id ?? 'replay-tool') })
  if (message.type === 'SystemMessage') return new SystemMessage({ content, additional_kwargs: kwargs })
  return new AIMessage({ content, additional_kwargs: kwargs })
}

async function main() {
  const file = process.env.WORLDEDIT_AGENT_PROMPT_FILE
  if (!file) throw new Error('Set WORLDEDIT_AGENT_PROMPT_FILE to a captured or edited prompt JSON file.')
  const raw = JSON.parse(await readFile(file, 'utf8')) as CapturedMessage[] | { messages?: CapturedMessage[] }
  const messages = Array.isArray(raw) ? raw : raw.messages
  if (!messages?.length) throw new Error('Prompt file must contain a non-empty messages array.')
  await initDatabase()
  const options = await modelConfigService.getModelOptions()
  if (!options.apiKey?.trim()) throw new Error('Missing model API key in application database.')
  const runtime = createConfiguredModelRuntime(options)
  const prepared = await runtime.familyAdapter.prepareMessages(messages.map(toMessage), runtime)
  const response = await runtime.model.invoke(prepared)
  const result = {
    model: options.model,
    baseURL: options.baseURL ?? null,
    response: typeof response.content === 'string' ? response.content : response.content
  }
  const outputFile = process.env.WORLDEDIT_AGENT_REPLAY_OUTPUT_FILE
  if (outputFile) await writeFile(outputFile, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { if (AppDataSource.isInitialized) await AppDataSource.destroy(); app.quit() })
