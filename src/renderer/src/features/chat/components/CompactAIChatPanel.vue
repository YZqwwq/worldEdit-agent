<template>
  <section class="compact-ai-chat-panel">
    <div
      ref="messagesContainer"
      class="compact-chat-messages"
      :class="{ 'compact-chat-messages-initializing': !messagesReady }"
      @scroll="handleMessagesScroll"
    >
      <div v-if="agentStage" class="compact-agent-stage">
        <span class="compact-stage-dot" aria-hidden="true" />
        <span>{{ agentStage.label }}</span>
      </div>

      <ChatMessageList
        :messages="messages"
        :participants="chatParticipants"
        :revertible-message-id="revertibleUserMessageId"
        :document-diff-locatable="true"
        @revert-message="handleRevertLastTurn"
        @document-diff-locate="$emit('document-diff-locate', $event)"
      />
    </div>

    <div class="compact-chat-composer">
      <MessageComposer
        ref="composerRef"
        v-model="userInput"
        variant="sidebar"
        :is-loading="isLoading"
        :can-send="canSendMessage"
        :uploaded-files="uploadedFiles"
        @send="handleSend"
        @interrupt="handleInterruptRun"
        @pick-file="handlePickFile"
        @paste-files="handlePasteFiles"
        @delete-file="requestDeleteFile"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAIChatService } from '../../../services/aiClientService'
import { agentWorkspaceContextService } from '../../../services/agentWorkspaceContextService'
import { isFilePickerCancelled } from '../../../utils/filePicker'
import ChatMessageList from './ChatMessageList.vue'
import MessageComposer from './MessageComposer.vue'
import type { ChatParticipantProfile, UploadedChatFile } from '../types'
import type { ChatMessage } from '../../../../../share/cache/render/aiagent/chatMessage'
import type { ChatMessageDocumentDiffReference } from '../../../../../share/cache/render/aiagent/chatMessage'
import type { WorldDocumentDiffHunk } from '@share/cache/worldbuilding/worldDocumentHistory'
import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'
import {
  isSupportedChatImageUpload,
  type MainAgentUserMessageInput
} from '../../../../../share/cache/AItype/states/mainAgentMessageContent'

const props = defineProps<{
  workspaceContext?: AgentWorkspaceContext
}>()

defineEmits<{
  (e: 'document-diff-locate', payload: {
    reference: ChatMessageDocumentDiffReference
    hunk: WorldDocumentDiffHunk
  }): void
}>()

const {
  messages,
  isLoading,
  sendMessage,
  interruptCurrentRun,
  revertLastChatTurn,
  loadHistory,
  refreshHistory,
  agentStage
} = useAIChatService()

const userInput = ref('')
const uploadedFiles = ref<UploadedChatFile[]>([])
const messagesContainer = ref<HTMLElement | null>(null)
const composerRef = ref<{ focusInput: () => void } | null>(null)
const shouldFollowMessages = ref(true)
const initialScrollPending = ref(false)
const messagesReady = ref(false)
const AUTO_SCROLL_THRESHOLD_PX = 80

const chatParticipants = ref<Record<'ai' | 'user', ChatParticipantProfile>>({
  ai: {
    label: 'AI',
    nickname: '法弥拉',
    avatarText: 'AI',
    avatarUrl: '',
    avatarAlt: '法弥拉头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'ai',
    statusIcon: '🔥'
  },
  user: {
    label: '你',
    nickname: '你',
    avatarText: '你',
    avatarUrl: '',
    avatarAlt: '用户头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'user'
  }
})

const canSendMessage = computed(
  () =>
    !uploadedFiles.value.some((file) => file.status === 'pending') &&
    (Boolean(userInput.value.trim()) || uploadedFiles.value.length > 0)
)

const revertibleTurnId = computed<number | undefined>(() => {
  if (isLoading.value) return undefined
  const lastMessage = messages.value.at(-1)
  if (!lastMessage || lastMessage.sender !== 'ai' || typeof lastMessage.turnId !== 'number') {
    return undefined
  }
  return lastMessage.turnId
})

const revertibleUserMessage = computed<ChatMessage | undefined>(() => {
  const turnId = revertibleTurnId.value
  if (typeof turnId !== 'number') return undefined
  return [...messages.value]
    .reverse()
    .find((message) => message.sender === 'user' && message.turnId === turnId)
})

const revertibleUserMessageId = computed<number | undefined>(() => revertibleUserMessage.value?.id)

const isNearBottom = (): boolean => {
  const container = messagesContainer.value
  if (!container) return true
  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
  return distanceToBottom <= AUTO_SCROLL_THRESHOLD_PX
}

const scrollMessagesToBottom = (behavior: ScrollBehavior = 'smooth'): void => {
  if (!messagesContainer.value) return
  messagesContainer.value.scrollTo({
    top: messagesContainer.value.scrollHeight,
    behavior
  })
}

const waitForFrame = (): Promise<void> =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

const settleInitialScroll = async (): Promise<void> => {
  initialScrollPending.value = true
  shouldFollowMessages.value = true
  // One frame lays out the message list, the next accounts for markdown and
  // media that finish measuring after the list itself has rendered.
  await nextTick()
  scrollMessagesToBottom('auto')
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForFrame()
  scrollMessagesToBottom('auto')
  await waitForFrame()
  scrollMessagesToBottom('auto')
  initialScrollPending.value = false
  messagesReady.value = true
}

const handleMessagesScroll = (): void => {
  shouldFollowMessages.value = isNearBottom()
}

const createUploadedFileId = (name: string): string =>
  self.crypto?.randomUUID ? self.crypto.randomUUID() : `${Date.now()}-${name}`

const readImagePreviewUrl = async (file: File): Promise<string | undefined> => {
  if (!String(file.type || '').startsWith('image/')) return undefined
  return await new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

const revokePreviewUrl = (file: UploadedChatFile | null | undefined): void => {
  const previewUrl = file?.previewUrl
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
}

const replaceUploadedFile = (fileId: string, next: UploadedChatFile): void => {
  uploadedFiles.value = uploadedFiles.value.map((file) => (file.id === fileId ? next : file))
}

const removeUploadedFile = (fileId: string): UploadedChatFile | undefined => {
  const target = uploadedFiles.value.find((item) => item.id === fileId)
  if (!target) return undefined
  revokePreviewUrl(target)
  uploadedFiles.value = uploadedFiles.value.filter((item) => item.id !== fileId)
  return target
}

const clearComposerFiles = (): void => {
  for (const file of uploadedFiles.value) {
    revokePreviewUrl(file)
  }
  uploadedFiles.value = []
}

const uploadPendingSourceFile = async (fileId: string, sourcePath: string): Promise<void> => {
  try {
    const uploaded = await window.api.uploadFile(sourcePath)
    const current = uploadedFiles.value.find((file) => file.id === fileId)
    if (!current) {
      await window.api.deleteFile(uploaded.resourceUrl).catch(() => undefined)
      return
    }
    replaceUploadedFile(fileId, {
      ...current,
      resourceUrl: uploaded.resourceUrl,
      mimeType: uploaded.mimeType ?? current.mimeType,
      previewUrl: current.previewUrl || uploaded.resourceUrl,
      status: 'uploaded'
    })
  } catch {
    removeUploadedFile(fileId)
  }
}

const uploadClipboardImage = async (fileId: string, file: File): Promise<void> => {
  try {
    const uploaded = await window.api.uploadFileData({
      fileName: file.name || `pasted-image-${Date.now()}.png`,
      mimeType: file.type || undefined,
      data: await file.arrayBuffer()
    })
    const current = uploadedFiles.value.find((item) => item.id === fileId)
    if (!current) {
      await window.api.deleteFile(uploaded.resourceUrl).catch(() => undefined)
      return
    }
    replaceUploadedFile(fileId, {
      ...current,
      resourceUrl: uploaded.resourceUrl,
      mimeType: uploaded.mimeType ?? current.mimeType,
      status: 'uploaded'
    })
  } catch {
    removeUploadedFile(fileId)
  }
}

const handleSend = async (): Promise<void> => {
  if (!canSendMessage.value) return
  shouldFollowMessages.value = true
  const workspaceContext = props.workspaceContext
    ? {
        ...JSON.parse(JSON.stringify(props.workspaceContext)),
        capturedAt: new Date().toISOString()
      }
    : agentWorkspaceContextService.snapshot()
  const input: MainAgentUserMessageInput = {
    text: userInput.value,
    workspaceContext,
    files: uploadedFiles.value
      .filter((file) => file.status === 'uploaded' && file.resourceUrl)
      .map((file) => ({
        fileId: file.id,
        fileUrl: file.resourceUrl as string,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.mimeType
      }))
  }
  await sendMessage(input)
  userInput.value = ''
  clearComposerFiles()
}

const handleInterruptRun = async (): Promise<void> => {
  await interruptCurrentRun()
}

const handleRevertLastTurn = async (message?: ChatMessage): Promise<void> => {
  const result = await revertLastChatTurn()
  if (!result.ok) return
  userInput.value =
    result.restoredInput?.text || message?.text || revertibleUserMessage.value?.text || ''
  clearComposerFiles()
  uploadedFiles.value = (result.restoredInput?.files ?? []).map((file) => ({
    id: file.fileId,
    name: file.fileName,
    resourceUrl: file.fileUrl,
    sourcePath: '',
    size: file.sizeBytes ?? 0,
    mimeType: file.mimeType,
    previewUrl: file.fileUrl,
    status: 'uploaded'
  }))
  await nextTick()
  scrollMessagesToBottom()
  composerRef.value?.focusInput()
}

const handlePickFile = async (): Promise<void> => {
  try {
    const result = await window.api.pickFile()
    const validation = isSupportedChatImageUpload({
      fileName: result.fileName,
      mimeType: result.mimeType,
      sizeBytes: result.size
    })
    if (!validation.ok) return
    const id = createUploadedFileId(result.fileName)
    uploadedFiles.value.push({
      id,
      name: result.fileName,
      sourcePath: result.sourcePath,
      size: result.size,
      mimeType: result.mimeType,
      status: 'pending'
    })
    void uploadPendingSourceFile(id, result.sourcePath)
  } catch (error: unknown) {
    if (isFilePickerCancelled(error)) return
  }
}

const handlePasteFiles = async (files: File[]): Promise<void> => {
  for (const file of files) {
    const validation = isSupportedChatImageUpload({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    })
    if (!validation.ok) continue
    const previewUrl = await readImagePreviewUrl(file)
    const id = createUploadedFileId(file.name || 'pasted-image')
    uploadedFiles.value.push({
      id,
      name: file.name || `pasted-image-${Date.now()}.png`,
      sourcePath: '',
      size: file.size,
      mimeType: file.type || undefined,
      previewUrl,
      status: 'pending'
    })
    void uploadClipboardImage(id, file)
  }
}

const requestDeleteFile = (file: UploadedChatFile): void => {
  if (!file.resourceUrl) {
    removeUploadedFile(file.id)
    return
  }
  void window.api.deleteFile(file.resourceUrl).catch(() => undefined)
  removeUploadedFile(file.id)
}

watch(
  messages,
  async () => {
    await nextTick()
    if (initialScrollPending.value) {
      scrollMessagesToBottom('auto')
    } else if (shouldFollowMessages.value) {
      scrollMessagesToBottom()
    }
  },
  { deep: true }
)

let refreshTimer: number | null = null

onMounted(async () => {
  await loadHistory()
  await settleInitialScroll()
  composerRef.value?.focusInput()

  refreshTimer = window.setInterval(() => {
    if (!isLoading.value) {
      void refreshHistory()
    }
  }, 2500)
})

onBeforeUnmount(() => {
  clearComposerFiles()
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.compact-ai-chat-panel {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1f2933;
}

.compact-stage-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #5d7cfa;
  box-shadow: 0 0 0 4px rgba(93, 124, 250, 0.12);
}

.compact-chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 12px;
  scroll-behavior: smooth;
}

.compact-chat-messages-initializing {
  visibility: hidden;
  scroll-behavior: auto;
}

.compact-chat-messages :deep(.flex.flex-col.gap-6) {
  gap: 14px;
}

.compact-chat-messages :deep(article .grid) {
  grid-template-columns: minmax(0, 1fr) !important;
}

.compact-chat-messages :deep(article .grid > .flex.pt-1) {
  display: none;
}

.compact-chat-messages :deep(.max-w-\[min\(100\%\,960px\)\]) {
  max-width: 100% !important;
}

.compact-chat-messages :deep(.chat-md-preview .md-editor-preview) {
  font-size: 13px !important;
}

.compact-agent-stage {
  position: sticky;
  top: 0;
  z-index: 4;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  padding: 6px 9px;
  color: #667085;
  font-size: 12px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}

.compact-chat-composer {
  position: relative;
  z-index: 5;
  min-height: 132px;
  flex-shrink: 0;
  padding: 8px 8px 10px;
  background: #ffffff;
}
</style>
