import { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync} from 'node:fs'
import { join } from 'node:path'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

type GraphRuntimeContext = {
  runId: string
}

const graphRuntimeStorage = new AsyncLocalStorage<GraphRuntimeContext>()

export function runWithGraphLogContext<T>(
  runId: string,
  fn: () => Promise<T>
): Promise<T> {
  return graphRuntimeStorage.run({ runId }, fn)
}

export function logNodeEnter(
  node: string,
): void {
  try {
    const debugPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(debugPath, `[${new Date().toISOString()}] logNodeEnter: ${node}\n`)
  } catch (e) {
    // ignore
  }
}

export function withGraphLog<T, R>(
  nodeName: string,
  fn: (state: T) => Promise<R>
): (state: T) => Promise<R> {
  return async (state: T): Promise<R> => {
    // 假设 state 包含 messages 和 llmCalls，如果类型不匹配可能需要调整
    // 这里使用 any 暂时绕过严格类型检查，因为 logNodeEnter 只需要这两个属性
    logNodeEnter(nodeName)
    
    try {
      const update = await fn(state)
      logNodeExit(nodeName)
      return update
    } catch (error) {
      // 可以在这里记录错误日志
      console.error(`Error in node ${nodeName}:`, error)
      throw error
    }
  }
}

function logNodeExit(
  node: string,
): void {
  // Only log to debug.log, no JSONL
  try {
    const debugPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(debugPath, `[${new Date().toISOString()}] logNodeExit: ${node}\n`)
  } catch (e) {
    // ignore
  }
}

/**
 * 提取并格式化 Prompt 消息
 */
function extractPrompt(messages: any[]): any[] {
  if (!Array.isArray(messages)) return []
  
  return messages.map((msg) => {
    let content = msg.content
    // 如果内容不是字符串（可能是多模态数组），转为 JSON 字符串以便展示
    if (typeof content !== 'string') {
      try {
        content = JSON.stringify(content)
      } catch (e) {
        content = '[Complex Content]'
      }
    }
    
    // 尝试获取角色名称
    const role = msg.constructor?.name?.replace('Message', '') || msg.role || 'unknown'
    
    return {
      role,
      content
    }
  })
}

/**
 * 处理 LangGraph 事件并生成简化的日志 Chunk
 */
export function handleGraphLogEvent(event: any): StreamChunk | null {
  const timestamp = Date.now()

  // 调试：全量打印 event 结构 (使用 JSON.stringify 避免中文乱码)
  // 过滤掉过于庞大的字段以防刷屏，重点关注 kwargs 和 tools
  if (event.event === 'on_chat_model_start' || (event.event === 'on_chain_start' && event.name === 'RunnableBinding')) {
     try {
       console.log(`--- [DEBUG] Event: ${event.event} (${event.name}) ---`)
       console.log(JSON.stringify(event, (key, value) => {
         // 稍微过滤一下无关的大对象，保留关键信息
         if (key === 'source' || key === 'lc_namespace') return undefined
         return value
       }, 2))
     } catch (e) {
       console.log('Error printing event:', e)
     }
  }

  // 1. 进入节点：AI 获取到的 Prompt 和可使用的工具
  // 使用 on_chat_model_start 而不是 on_chain_start，以获取最底层的模型输入
  if (event.event === 'on_chat_model_start') {
    const params = event.data?.kwargs || {}
    // 检查多种可能的工具存放位置
    // 在绑定工具后的模型中，tools 可能不直接暴露在 kwargs.tools 中，而是作为 invocation_params 或其他内部字段
    // 但通常 kwargs.tools 或 kwargs.functions 应该是有的。
    // 如果没有，可能是 event 数据结构在不同版本 LangChain 中的差异。
    // 我们尝试从 event.data.extra.options 或 event.data.extra.invocation_params 中查找
    
    // 兼容 input 直接为数组的情况 (当 invoke(messages) 时)
    let messages = []
    if (Array.isArray(event.data?.input)) {
      messages = event.data.input
    } else {
      messages = event.data?.input?.messages || []
    }
    
    const modelName = params.model || event.name || 'AI Model'

    return {
      type: 'agent_log',
      subType: 'node_enter',
      nodeName: modelName,
      data: {
        info: 'AI Processing Start',
        prompt: extractPrompt(messages)
      },
      timestamp
    }
  }

  // 2. 完成节点：AI 的返回结果与调用的工具
  if (event.event === 'on_chat_model_end') {
    // 尝试多种路径获取输出
    const output = event.data?.output
    let resultText = '(No Text Content)'
    let toolCalls = []

    if (output) {
      // 路径 A: ChatResult -> generations -> message
      const generation = output.generations?.[0]
      if (generation) {
        const message = generation.message || generation
        resultText = message.content || resultText
        toolCalls = message.tool_calls || message.additional_kwargs?.tool_calls || []
      } 
      // 路径 B: 直接是 BaseMessage (很少见但为了健壮性)
      else if (output.content) {
        resultText = output.content
        toolCalls = output.tool_calls || output.additional_kwargs?.tool_calls || []
      }
    }

    return {
      type: 'agent_log',
      subType: 'node_exit',
      nodeName: event.name || 'AI Model',
      data: {
        info: 'AI Processing Complete',
        result: resultText,
        tool_calls: toolCalls
      },
      timestamp
    }
  }

  // 3. 工具调用监控
  if (event.event === 'on_tool_start') {
    return {
      type: 'agent_log',
      subType: 'tool_start',
      nodeName: event.name,
      data: {
        input: event.data?.input
      },
      timestamp
    }
  }

  if (event.event === 'on_tool_end') {
    return {
      type: 'agent_log',
      subType: 'tool_end',
      nodeName: event.name,
      data: {
        output: event.data?.output
      },
      timestamp
    }
  }

  return null
}
