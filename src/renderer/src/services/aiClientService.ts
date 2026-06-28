import { ref, type Ref } from 'vue'
import {
  inferMainAgentFileMediaType,
  parseMainAgentMessageContentJson,
  type MainAgentMessageContentPart,
  type MainAgentUserInputFile,
  type MainAgentUserMessageInput
} from '../../../share/cache/AItype/states/mainAgentMessageContent'
import type { ChatMessage, ChatMessageAttachment } from '../../../share/cache/render/aiagent/chatMessage'
import { partsToMarkdown } from '../utils/aiToMarkdown'
import type { AgentStageChunk, StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import type { AgentTraceRecord } from '../../../share/cache/render/aiagent/agentTrace'

export type AgentLog = AgentTraceRecord

// A reactive reference to hold the list of chat messages
const messages = ref<ChatMessage[]>([])
const agentLogs = ref<AgentLog[]>([]) // 存储当前会话的监控日志
const agentStage = ref<AgentStageChunk | null>(null)

// A reactive reference to track if the AI is currently thinking
const isLoading = ref(false)

// 当前正在响应的消息 ID，用于流式追加内容
let currentStreamingMessageId: number | null = null
let currentStreamingText = ''
let stopListening: (() => void) | null = null
let stageClearTimer: ReturnType<typeof setTimeout> | null = null

const setAgentStage = (stage: AgentStageChunk | null): void => {
  if (stageClearTimer) {
    clearTimeout(stageClearTimer)
    stageClearTimer = null
  }
  agentStage.value = stage
}

const clearAgentStageSoon = (stageId: string): void => {
  if (stageClearTimer) {
    clearTimeout(stageClearTimer)
  }
  stageClearTimer = setTimeout(() => {
    if (agentStage.value?.stageId === stageId) {
      agentStage.value = null
    }
    stageClearTimer = null
  }, 900)
}

const buildChatAttachmentsFromContent = (
  content: MainAgentMessageContentPart[]
): ChatMessageAttachment[] =>
  content
    .filter((part): part is Extract<MainAgentMessageContentPart, { type: 'file' }> => part.type === 'file')
    .map((part) => ({
      fileId: part.fileId,
      fileName: part.fileName,
      fileUrl: part.fileUrl,
      mimeType: part.mimeType,
      mediaType: part.mediaType || inferMainAgentFileMediaType(part)
    }))

const buildChatAttachmentsFromInput = (
  files: MainAgentUserInputFile[] | undefined
): ChatMessageAttachment[] =>
  (files ?? []).map((file) => ({
    fileId: file.fileId,
    fileName: file.fileName,
    fileUrl: file.fileUrl,
    mimeType: file.mimeType,
    mediaType: file.mediaType || inferMainAgentFileMediaType(file)
  }))

const extractChatTextFromContent = (content: MainAgentMessageContentPart[]): string =>
  content
    .filter((part): part is Extract<MainAgentMessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim()

const mapHistoryToMessages = (history: any[]): ChatMessage[] =>
  history.map((msg: any) => {
    const contentParts =
      typeof msg.contentJson === 'string' && msg.contentJson.trim()
        ? parseMainAgentMessageContentJson(msg.contentJson)
        : []
    const text = contentParts.length > 0 ? extractChatTextFromContent(contentParts) : String(msg.content || '')
    const attachments = contentParts.length > 0 ? buildChatAttachmentsFromContent(contentParts) : []

    return {
      id: msg.id,
      text,
      attachments,
      sender: msg.role,
      timestamp: msg.createdAt ? new Date(msg.createdAt).getTime() : undefined,
      turnId: typeof msg.turnId === 'number' ? msg.turnId : undefined,
      status: typeof msg.status === 'string' ? msg.status : undefined
    }
  })

/**
 * 处理流式数据包
 */
function handleStreamChunk(chunk: StreamChunk): void {
  // 如果收到 chunk 时还没有占位消息，理论上不应发生，但为了安全
  if (!currentStreamingMessageId) return

  // 找到当前消息对象
  const msg = messages.value.find((m) => m.id === currentStreamingMessageId)
  if (!msg) return

  switch (chunk.type) {
    case 'text_delta':
      // 如果是第一次收到文本，清除“思考中”占位符
      if (msg.text === '正在思考中...') {
        msg.text = ''
      }
      currentStreamingText += chunk.content
      msg.text = currentStreamingText
      break
    
    case 'agent_trace':
      agentLogs.value.push(chunk.record)
      break

    case 'agent_stage':
      setAgentStage(chunk)
      if (chunk.status === 'done' || chunk.status === 'error') {
        clearAgentStageSoon(chunk.stageId)
      }
      break

    case 'stream_error':
      msg.text =
        msg.text === '正在思考中...' || !msg.text.trim()
          ? chunk.message || '模型超时，未收到回复。'
          : `${msg.text}\n\n${chunk.message || '模型超时，未收到回复。'}`
      isLoading.value = false
      setAgentStage(null)
      cleanupListener()
      break

    case 'done':
      // 结束信号，可选用完整富结构替换
      if (chunk.fullContent) {
        msg.text = partsToMarkdown(chunk.fullContent)
      }
      isLoading.value = false
      setAgentStage(null)
      cleanupListener()
      break
  }
}

function cleanupListener(): void {
  if (stopListening) {
    stopListening()
    stopListening = null
  }
  currentStreamingMessageId = null
  currentStreamingText = ''
  setAgentStage(null)
  // 注意：agentLogs 不在这里清除，可能用户想保留查看，直到下次发送前
}

/**
 * 加载历史记录
 */
async function loadHistory(): Promise<void> {
  try {
    const history = await window.api.getHistory()
    if (history && Array.isArray(history)) {
      messages.value = mapHistoryToMessages(history)
    }
  } catch (error) {
    console.error('Failed to load history:', error)
  }
}

async function refreshHistory(): Promise<void> {
  if (currentStreamingMessageId || isLoading.value) {
    return
  }
  try {
    const history = await window.api.getHistory()
    if (history && Array.isArray(history)) {
      messages.value = mapHistoryToMessages(history)
    }
  } catch (error) {
    console.error('Failed to refresh history:', error)
  }
}

/**
 * 清除所有历史记录
 */
async function clearHistory(): Promise<void> {
  try {
    if (!window.api?.clearHistory) {
      const msg = '检测到 API 更新未生效，请重启 Electron 应用 (npm run dev) 以加载最新代码。'
      console.error(msg)
      alert(msg)
      return
    }
    await window.api.clearHistory()
    messages.value = []
    agentLogs.value = []
    setAgentStage(null)
  } catch (error) {
    console.error('Failed to clear history:', error)
  }
}

async function interruptCurrentRun(): Promise<{ ok: boolean; message: string }> {
  try {
    return await window.api.interruptCurrentRun()
  } catch (error) {
    console.error('Failed to interrupt current run:', error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function revertLastChatTurn(): Promise<{
  ok: boolean
  message: string
  revertedTurnId?: number
  restoredInput?: MainAgentUserMessageInput
}> {
  try {
    const result = await window.api.revertLastChatTurn()
    if (result.ok) {
      await refreshHistory()
    }
    return result
  } catch (error) {
    console.error('Failed to revert last chat turn:', error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 清空所有 AI 运行数据（历史、记忆、人格、上传文件）
 */
async function purgeAllData(): Promise<void> {
  try {
    if (!window.api?.purgeAllData) {
      const msg = '检测到 API 更新未生效，请重启 Electron 应用 (npm run dev) 以加载最新代码。'
      console.error(msg)
      alert(msg)
      return
    }
    await window.api.purgeAllData()
    messages.value = []
    agentLogs.value = []
    setAgentStage(null)
  } catch (error) {
    console.error('Failed to purge all data:', error)
  }
}

/**
 * 重置 AI 状态（历史、记忆、人格、情绪链路）
 */
async function resetAgentState(): Promise<void> {
  try {
    if (!window.api?.resetAgentState) {
      const msg = '检测到 API 更新未生效，请重启 Electron 应用 (npm run dev) 以加载最新代码。'
      console.error(msg)
      alert(msg)
      return
    }
    await window.api.resetAgentState()
    messages.value = []
    agentLogs.value = []
    setAgentStage(null)
  } catch (error) {
    console.error('Failed to reset agent state:', error)
  }
}

/**
 * Sends a message to the AI and updates the chat.
 * @param input - The user message payload.
 */
const buildOptimisticMessageText = (input: MainAgentUserMessageInput): string => {
  return input.text?.trim() || ''
}

async function sendMessage(input: MainAgentUserMessageInput): Promise<void> {
  const requestId =
    input.requestId?.trim() ||
    (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const payload: MainAgentUserMessageInput = {
    ...input,
    requestId
  }
  const optimisticText = buildOptimisticMessageText(payload)
  const hasFiles = (payload.files?.length ?? 0) > 0
  if ((!optimisticText.trim() && !hasFiles) || isLoading.value) {
    return
  }

  // 1. Add user's message to the list
  const userMsgId = Date.now()
  messages.value.push({
    id: userMsgId,
    text: optimisticText,
    attachments: buildChatAttachmentsFromInput(payload.files),
    sender: 'user',
    timestamp: userMsgId
  })

  // 2. Set loading state & Init listener
  isLoading.value = true
  agentLogs.value = [] // 清空旧日志，开始新一轮监控
  setAgentStage(null)
  
  // 注册监听器
  cleanupListener() // 确保清理旧的
  stopListening = window.api.onStreamChunk(handleStreamChunk)

  // Add a placeholder for the AI response
  const aiMsgId = userMsgId + 1
  currentStreamingMessageId = aiMsgId
  currentStreamingText = '' // 重置缓冲文本
  
  messages.value.push({
    id: aiMsgId,
    text: '正在思考中...',
    sender: 'ai',
    timestamp: aiMsgId
  })

  try {
    // 3. 调用流式接口
    window.api.sendMessageStream(payload)
  } catch (error) {
    console.error('Error sending message to AI:', error)
    const msg = messages.value.find((m) => m.id === aiMsgId)
    if (msg) msg.text = '抱歉，与AI通信时发生错误。'
    isLoading.value = false
    setAgentStage(null)
    cleanupListener()
  }
}

// This is the "service" that the Vue component will use.
// It exposes the reactive state and the function to modify it.
export function useAIChatService(): {
  messages: Ref<ChatMessage[]>
  agentLogs: Ref<AgentLog[]>
  agentStage: Ref<AgentStageChunk | null>
  isLoading: Ref<boolean>
  sendMessage: (input: MainAgentUserMessageInput) => Promise<void>
  interruptCurrentRun: () => Promise<{ ok: boolean; message: string }>
  revertLastChatTurn: () => Promise<{
    ok: boolean
    message: string
    revertedTurnId?: number
    restoredInput?: MainAgentUserMessageInput
  }>
  loadHistory: () => Promise<void>
  refreshHistory: () => Promise<void>
  clearHistory: () => Promise<void>
  purgeAllData: () => Promise<void>
  resetAgentState: () => Promise<void>
} {
  return {
    messages,
    agentLogs,
    agentStage,
    isLoading,
    sendMessage,
    interruptCurrentRun,
    revertLastChatTurn,
    loadHistory,
    refreshHistory,
    clearHistory,
    purgeAllData,
    resetAgentState
  }
}
