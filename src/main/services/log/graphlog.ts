import { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'

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

  // 1. 进入节点：AI 获取到的 Prompt 和可使用的工具
  // 使用 on_chat_model_start 而不是 on_chain_start，以获取最底层的模型输入
  if (event.event === 'on_chat_model_start') {
    const params = event.data?.kwargs || {}
    // 检查多种可能的工具存放位置
    // 在绑定工具后的模型中，tools 可能不直接暴露在 kwargs.tools 中，而是作为 invocation_params 或其他内部字段
    // 但通常 kwargs.tools 或 kwargs.functions 应该是有的。
    // 如果没有，可能是 event 数据结构在不同版本 LangChain 中的差异。
    // 我们尝试从 event.data.extra.options 或 event.data.extra.invocation_params 中查找
    
    let tools = params.tools || params.functions || params.bind_tools || []
    
    if (tools.length === 0) {
        // 深度查找：有时 tools 藏在 invocation_params 中
        const invocationParams = event.data?.extra?.invocation_params || {}
        tools = invocationParams.tools || invocationParams.functions || []
    }

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
        prompt: extractPrompt(messages),
        available_tools: tools.map((t: any) => t.function?.name || t.name || 'unknown')
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
