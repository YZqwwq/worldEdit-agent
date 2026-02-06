import { END, START, StateGraph } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { contextNode } from './node/contextnode/contextnode' // 导入 ContextNode
import { shouldContinue } from './endlogic/shouldContinue'
import { getBoundToolsForLog } from './modelwithtool/modelwithtool'

type RunnableConfig = {
  configurable?: {
    thread_id?: string
  }
}

type SerializableMessage = {
  type: string
  content: string
}

type SerializableMessagesState = {
  llmCalls: number | null
  messages: SerializableMessage[]
}

type SerializableMessagesUpdate = Partial<SerializableMessagesState>

type NodeLogRecord = {
  ts: number
  node: 'contextNode' | 'llmCall' | 'toolNode'
  phase: 'in' | 'out'
  tools?: ReturnType<typeof getBoundToolsForLog>
  state?: SerializableMessagesState
  update?: SerializableMessagesUpdate | { messages: SerializableMessage[] }
}

const LOGS_DIR = join(process.cwd(), 'src/main/services/log/logs')

function stringifyMessageContent(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content
  return JSON.stringify(content)
}

function serializeMessages(messages: BaseMessage[]): SerializableMessage[] {
  return messages.map((msg) => ({
    type: msg.constructor?.name ?? 'BaseMessage',
    content: stringifyMessageContent(msg.content)
  }))
}

function serializeMessagesState(state: typeof MessagesState.State): SerializableMessagesState {
  return {
    llmCalls: state.llmCalls ?? null,
    messages: serializeMessages(state.messages)
  }
}

function serializeMessagesUpdate(update: Partial<typeof MessagesState.State>): SerializableMessagesUpdate {
  return {
    llmCalls: update.llmCalls ?? null,
    messages: update.messages ? serializeMessages(update.messages) : []
  }
}

async function appendLogLine(threadId: string, record: NodeLogRecord): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true })
  const filePath = join(LOGS_DIR, `${threadId}.jsonl`)
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8')
}

async function loggedContextNode(
  state: typeof MessagesState.State,
  config?: RunnableConfig
): Promise<Partial<typeof MessagesState.State>> {
  const threadId = config?.configurable?.thread_id ?? 'no-thread'
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'contextNode',
    phase: 'in',
    state: serializeMessagesState(state)
  })
  const update = await contextNode(state)
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'contextNode',
    phase: 'out',
    update: serializeMessagesUpdate(update)
  })
  return update
}

async function loggedLlmCall(
  state: typeof MessagesState.State,
  config?: RunnableConfig
): Promise<Partial<typeof MessagesState.State>> {
  const threadId = config?.configurable?.thread_id ?? 'no-thread'
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'llmCall',
    phase: 'in',
    tools: getBoundToolsForLog(),
    state: serializeMessagesState(state)
  })
  const update = await llmCall(state)
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'llmCall',
    phase: 'out',
    update: serializeMessagesUpdate(update)
  })
  return update
}

async function loggedToolNode(
  state: typeof MessagesState.State,
  config?: RunnableConfig
): Promise<{ messages: BaseMessage[] }> {
  const threadId = config?.configurable?.thread_id ?? 'no-thread'
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'toolNode',
    phase: 'in',
    state: serializeMessagesState(state)
  })
  const update = await toolNode(state)
  await appendLogLine(threadId, {
    ts: Date.now(),
    node: 'toolNode',
    phase: 'out',
    update: {
      messages: serializeMessages(update.messages)
    }
  })
  return { messages: update.messages }
}

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('contextNode', loggedContextNode) // 添加 context 节点
  .addNode('llmCall', loggedLlmCall)
  .addNode('toolNode', loggedToolNode)
  .addEdge(START, 'contextNode') // 从 START -> contextNode
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  .addConditionalEdges('llmCall', shouldContinue, ['toolNode', END])
  .addEdge('toolNode', 'llmCall')
  .compile()
