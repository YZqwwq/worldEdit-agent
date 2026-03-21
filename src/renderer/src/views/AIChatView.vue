<template>
  <div
    class="h-screen overflow-hidden bg-[linear-gradient(180deg,_#f7fafe_0%,_#f3f6fb_100%)]"
  >
    <div class="flex h-full w-full">
      <section
        class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-200/80 bg-white/55"
        :class="{ 'border-r-0': !showRightSidebar }"
      >
        <ChatHeader
          :show-logs="showLogs"
          :show-tasks="showTasks"
          :disable-purge="isLoading || purgeConfirmLoading"
          @open-memory="openMemorySnapshot"
          @open-model-config="openModelConfig"
          @open-purge-confirm="openPurgeConfirm"
          @toggle-logs="showLogs = !showLogs"
          @toggle-tasks="showTasks = !showTasks"
        />

      <div
        class="flex flex-grow flex-col overflow-y-auto px-10 py-8 scroll-smooth"
        ref="messagesContainer"
        @scroll="handleMessagesScroll"
      >
        <ChatMessageList
          :messages="messages"
          :participants="chatParticipants"
          @edit-avatar="openAvatarEditor"
        />
      </div>

        <div class="border-t border-slate-200/80 bg-white/80 px-8 pb-7 pt-5">
          <MessageComposer
            ref="composerRef"
            v-model="userInput"
            :is-loading="isLoading"
            :uploaded-files="uploadedFiles"
            @send="handleSend"
            @pick-file="handlePickFile"
            @delete-file="requestDeleteFile"
          />
        </div>
      </section>

      <transition
        enter-active-class="transition ease-out duration-300"
        enter-from-class="transform translate-x-4 opacity-0"
        enter-to-class="transform translate-x-0 opacity-100"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="transform translate-x-0 opacity-100"
        leave-to-class="transform translate-x-4 opacity-0"
      >
        <aside
          v-if="showRightSidebar"
          class="flex h-full w-[360px] flex-shrink-0 flex-col border-l border-slate-200 bg-white"
        >
          <AILogPanel v-if="showLogs" :logs="agentLogs" />
          <TaskQueuePanel
            v-if="showTasks"
            :snapshot="taskMonitorSnapshot"
            :loading="taskMonitorLoading"
            :class="{ 'border-t border-slate-200': showLogs }"
          />
        </aside>
      </transition>
    </div>

    <div
      v-if="showMemorySnapshot"
      class="absolute inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
    >
      <div class="w-full max-w-4xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">AI 当前记忆状态</h3>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              :disabled="memorySnapshotLoading"
              @click="loadMemorySnapshot"
            >
              {{ memorySnapshotLoading ? '刷新中...' : '刷新' }}
            </button>
            <button
              type="button"
              class="text-gray-500 hover:text-gray-700"
              @click="showMemorySnapshot = false"
            >
              ✕
            </button>
          </div>
        </div>

        <div v-if="memorySnapshotError" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ memorySnapshotError }}
        </div>

        <div v-if="memorySnapshotData" class="space-y-5">
          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-800">长期记忆摘要</h4>
            <div class="whitespace-pre-wrap break-words text-sm text-gray-700 leading-6 min-h-[72px]">
              {{ memorySnapshotData.memory.summary || '（暂无长期摘要）' }}
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-800">锚点记忆 (Anchors)</h4>
            <div v-if="memorySnapshotData.memory.anchors.length" class="flex flex-wrap gap-2">
              <span
                v-for="(anchor, index) in memorySnapshotData.memory.anchors"
                :key="`anchor-${index}`"
                class="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 border border-blue-100"
              >
                {{ anchor }}
              </span>
            </div>
            <div v-else class="text-sm text-gray-500">（暂无锚点）</div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-800">短期滑动窗口（{{ memorySnapshotData.memory.shortTerm.length }} 条）</h4>
            <div v-if="memorySnapshotData.memory.shortTerm.length" class="space-y-2">
              <div
                v-for="(item, index) in memorySnapshotData.memory.shortTerm"
                :key="`short-term-${index}-${item.timestamp}`"
                class="rounded border border-gray-100 bg-gray-50 p-3"
              >
                <div class="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span class="font-medium">{{ item.role }}</span>
                  <span>{{ formatIsoTime(item.timestamp) }}</span>
                </div>
                <div class="whitespace-pre-wrap break-words text-sm text-gray-700">{{ item.content }}</div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">（暂无短期记忆）</div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <div class="mb-2 flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold text-gray-800">人格状态</h4>
              <button
                type="button"
                class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="memorySnapshotLoading || personaResetLoading"
                @click="openPersonaResetConfirm"
              >
                {{ personaResetLoading ? '重置中...' : '重置人格' }}
              </button>
            </div>
            <template v-if="memorySnapshotData.persona">
              <div class="mb-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                {{ memorySnapshotData.persona.current_behavioral_narrative }}
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs text-gray-700 md:grid-cols-4">
                <div class="rounded border border-gray-100 bg-gray-50 p-2">
                  autonomy: {{ memorySnapshotData.persona.metrics.autonomy_level.toFixed(2) }}
                </div>
                <div class="rounded border border-gray-100 bg-gray-50 p-2">
                  verbosity: {{ memorySnapshotData.persona.metrics.verbosity_index.toFixed(2) }}
                </div>
                <div class="rounded border border-gray-100 bg-gray-50 p-2">
                  risk: {{ memorySnapshotData.persona.metrics.risk_tolerance.toFixed(2) }}
                </div>
                <div class="rounded border border-gray-100 bg-gray-50 p-2">
                  formality: {{ memorySnapshotData.persona.metrics.formality_score.toFixed(2) }}
                </div>
              </div>
              <div class="mt-3 text-xs text-gray-500">
                最后更新：{{ formatIsoTime(memorySnapshotData.persona.last_updated) }}
              </div>
            </template>
            <div v-else class="text-sm text-gray-500">（暂无人格状态）</div>
          </section>
        </div>

        <div v-else-if="memorySnapshotLoading" class="py-8 text-center text-sm text-gray-500">
          正在读取记忆状态...
        </div>

        <div v-else class="py-8 text-center text-sm text-gray-500">
          暂无可展示的记忆数据
        </div>
      </div>
    </div>

    <div
      v-if="showModelConfig"
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
    >
      <div class="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">模型设置</h3>
          <button
            type="button"
            class="text-gray-500 hover:text-gray-700"
            @click="showModelConfig = false"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm text-gray-700">
            模型别名
            <input
              v-model="modelConfigForm.modelName"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="例如：默认模型"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            Vendor
            <select
              v-model="modelConfigForm.vendor"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="openai">openai-compatible</option>
              <option value="anthropic">anthropic</option>
            </select>
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            模型名称
            <input
              v-model="modelConfigForm.model"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="例如：qwen-plus"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            API Key
            <div class="flex gap-2">
              <input
                v-model="modelConfigForm.modelKey"
                :type="showModelKey ? 'text' : 'password'"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                placeholder="请输入模型密钥"
              />
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600"
                @click="showModelKey = !showModelKey"
              >
                {{ showModelKey ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            Base URL
            <input
              v-model="modelConfigForm.baseURL"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="例如：https://dashscope.aliyuncs.com/compatible-mode/v1"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            Temperature
            <input
              v-model.number="modelConfigForm.temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="modelConfigForm.streaming" type="checkbox" />
            启用 streaming
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
            <input v-model="modelConfigForm.useResponsesApi" type="checkbox" />
            启用 Responses API（仅 OpenAI 兼容模型生效）
          </label>
        </div>

        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
            @click="showModelConfig = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="modelConfigSaving || modelConfigLoading"
            @click="saveModelConfig"
          >
            {{ modelConfigSaving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model="showPurgeConfirm"
      title="确认清空所有 AI 数据？"
      message="这将删除对话历史、记忆状态、人格状态和上传文件，且无法撤销。"
      confirm-text="确认清空"
      cancel-text="取消"
      loading-text="清空中..."
      size="md"
      icon="warning"
      :danger="true"
      :loading="purgeConfirmLoading"
      @confirm="confirmPurgeAllData"
      @cancel="restoreInputFocus"
    />

    <ConfirmDialog
      v-model="showDeleteFileConfirm"
      title="确认删除文件？"
      :message="deleteFileConfirmMessage"
      confirm-text="删除"
      cancel-text="取消"
      loading-text="删除中..."
      size="sm"
      icon="danger"
      :danger="true"
      :loading="deleteFileConfirmLoading"
      @confirm="confirmDeleteFile"
      @cancel="cancelDeleteFile"
    />

    <ConfirmDialog
      v-model="showPersonaResetConfirm"
      title="确认重置人格状态？"
      message="这将把人格指标恢复到默认初始值，不会删除对话历史、记忆和上传文件。"
      confirm-text="重置人格"
      cancel-text="取消"
      loading-text="重置中..."
      size="sm"
      icon="warning"
      :danger="true"
      :loading="personaResetLoading"
      @confirm="confirmResetPersonaState"
      @cancel="restoreInputFocus"
    />

    <ConfirmDialog
      v-model="showNoticeDialog"
      :title="noticeTitle"
      :message="noticeMessage"
      confirm-text="知道了"
      :show-cancel="false"
      size="sm"
      :icon="noticeIcon"
      @confirm="closeNoticeDialog"
    />

    <AvatarEditorDialog
      v-model="showAvatarEditor"
      :participant="editingParticipant"
      @apply="applyAvatarProfile"
      @cancel="restoreInputFocus"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAIChatService } from '../services/aiClientService'
import { isFilePickerCancelled } from '../utils/filePicker'
import AILogPanel from '../components/AILogPanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TaskQueuePanel from '../components/TaskQueuePanel.vue'
import AvatarEditorDialog from '../features/chat/components/AvatarEditorDialog.vue'
import ChatHeader from '../features/chat/components/ChatHeader.vue'
import ChatMessageList from '../features/chat/components/ChatMessageList.vue'
import MessageComposer from '../features/chat/components/MessageComposer.vue'
import type { ChatParticipantProfile, UploadedChatFile } from '../features/chat/types'
import type { ChatAvatarProfilesPayload, ChatParticipantKey } from '../../../share/cache/render/aiagent/chatAvatarProfile'
import type {
  ModelConfigInput,
  ModelConfigPayload
} from '../../../share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '../../../share/cache/AItype/states/memoryInspection'
import type { TaskMonitorSnapshot } from '../../../share/cache/AItype/states/taskLifecycleState'

const {
  messages,
  isLoading,
  sendMessage,
  loadHistory,
  refreshHistory,
  purgeAllData,
  resetPersonaState,
  agentLogs
} =
  useAIChatService()
const userInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const composerRef = ref<{ focusInput: () => void } | null>(null)
const showLogs = ref(true) // 默认开启调试面板以便演示
const showTasks = ref(true)
const showModelConfig = ref(false)
const modelConfigLoading = ref(false)
const modelConfigSaving = ref(false)
const showModelKey = ref(false)
const showMemorySnapshot = ref(false)
const memorySnapshotLoading = ref(false)
const memorySnapshotError = ref('')
const memorySnapshotData = ref<MemoryInspectionPayload | null>(null)
const showPersonaResetConfirm = ref(false)
const personaResetLoading = ref(false)
const showPurgeConfirm = ref(false)
const purgeConfirmLoading = ref(false)
type DialogIcon = 'none' | 'info' | 'warning' | 'danger' | 'success'

const uploadedFiles = ref<UploadedChatFile[]>([])
const pendingDeleteFile = ref<UploadedChatFile | null>(null)
const showDeleteFileConfirm = ref(false)
const deleteFileConfirmLoading = ref(false)
const showNoticeDialog = ref(false)
const noticeTitle = ref('')
const noticeMessage = ref('')
const noticeIcon = ref<DialogIcon>('info')
const showAvatarEditor = ref(false)
const editingParticipantKey = ref<ChatParticipantKey>('ai')
const taskMonitorSnapshot = ref<TaskMonitorSnapshot | null>(null)
const taskMonitorLoading = ref(false)
const shouldFollowMessages = ref(true)
let taskMonitorTimer: number | null = null

const showRightSidebar = computed(() => showLogs.value || showTasks.value)
const AUTO_SCROLL_THRESHOLD_PX = 120

const deleteFileConfirmMessage = computed<string>(() => {
  const file = pendingDeleteFile.value
  if (!file) return '确认删除该文件吗？'
  return `文件名：${file.name}\n此操作无法撤销。`
})

const defaultModelConfig: ModelConfigInput = {
  modelKey: '',
  vendor: 'openai',
  model: 'qwen-plus',
  modelName: '默认模型',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  temperature: 0.9,
  streaming: true,
  useResponsesApi: false
}

const modelConfigForm = ref<ModelConfigInput>({
  ...defaultModelConfig
})

const chatParticipants = ref<Record<'ai' | 'user', ChatParticipantProfile>>({
  ai: {
    label: 'AI AGENT',
    nickname: '法弥拉',
    avatarText: 'AI',
    avatarUrl: '',
    avatarAlt: '法弥拉头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'ai' as const,
    statusIcon: '🔥'
  },
  user: {
    label: 'USER',
    nickname: '你',
    avatarText: '你',
    avatarUrl: '',
    avatarAlt: '用户头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'user' as const
  }
})

const editingParticipant = computed<ChatParticipantProfile | null>(
  () => chatParticipants.value[editingParticipantKey.value] ?? null
)

const mergeAvatarProfiles = (profiles: ChatAvatarProfilesPayload): void => {
  chatParticipants.value = {
    ai: {
      ...chatParticipants.value.ai,
      ...(profiles.ai ?? {})
    },
    user: {
      ...chatParticipants.value.user,
      ...(profiles.user ?? {})
    }
  }
}

const applyModelConfig = (config: ModelConfigPayload): void => {
  modelConfigForm.value = {
    modelKey: config.modelKey || '',
    vendor: config.vendor,
    model: config.model || 'qwen-plus',
    modelName: config.modelName || '默认模型',
    baseURL: config.baseURL || '',
    temperature: Number.isFinite(config.temperature) ? config.temperature : 0.9,
    streaming: config.streaming !== false,
    useResponsesApi: config.useResponsesApi === true
  }
}

const loadModelConfig = async (): Promise<void> => {
  modelConfigLoading.value = true
  try {
    const config = await window.api.getModelConfig()
    applyModelConfig(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('加载模型配置失败', message, 'warning')
  } finally {
    modelConfigLoading.value = false
  }
}

const loadMemorySnapshot = async (): Promise<void> => {
  memorySnapshotLoading.value = true
  memorySnapshotError.value = ''
  try {
    const data = await window.api.getMemorySnapshot()
    memorySnapshotData.value = data
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    memorySnapshotError.value = `读取记忆状态失败：${message}`
  } finally {
    memorySnapshotLoading.value = false
  }
}

const openMemorySnapshot = async (): Promise<void> => {
  showMemorySnapshot.value = true
  await loadMemorySnapshot()
}

const openPersonaResetConfirm = (): void => {
  showPersonaResetConfirm.value = true
}

const openModelConfig = async (): Promise<void> => {
  await loadModelConfig()
  showModelConfig.value = true
}

const saveModelConfig = async (): Promise<void> => {
  if (!modelConfigForm.value.model.trim()) {
    showNotice('参数校验失败', '模型名称不能为空', 'warning')
    return
  }
  modelConfigSaving.value = true
  try {
    const saved = await window.api.saveModelConfig({
      ...modelConfigForm.value,
      model: modelConfigForm.value.model.trim(),
      modelName: modelConfigForm.value.modelName.trim() || '默认模型',
      baseURL: modelConfigForm.value.baseURL.trim(),
      modelKey: modelConfigForm.value.modelKey.trim(),
      temperature: Number(modelConfigForm.value.temperature)
    })
    applyModelConfig(saved)
    showModelConfig.value = false
    showNotice('保存成功', '模型配置已保存。下一次对话会使用新配置。', 'success')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('保存模型配置失败', message, 'warning')
  } finally {
    modelConfigSaving.value = false
  }
}

const loadTaskMonitorSnapshot = async (silent = false): Promise<void> => {
  if (!silent) {
    taskMonitorLoading.value = true
  }
  try {
    taskMonitorSnapshot.value = await window.api.getTaskMonitorSnapshot()
  } catch (error) {
    console.error('Failed to load task monitor snapshot:', error)
  } finally {
    taskMonitorLoading.value = false
  }
}

const isNearBottom = (): boolean => {
  const container = messagesContainer.value
  if (!container) return true

  const distanceToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight
  return distanceToBottom <= AUTO_SCROLL_THRESHOLD_PX
}

const scrollMessagesToBottom = (): void => {
  if (!messagesContainer.value) return
  messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

const handleMessagesScroll = (): void => {
  shouldFollowMessages.value = isNearBottom()
}

// Load history when component is mounted
onMounted(async () => {
  await loadModelConfig()
  mergeAvatarProfiles(await window.api.getAvatarProfiles())
  await loadTaskMonitorSnapshot()
  await loadHistory()
  taskMonitorTimer = window.setInterval(() => {
    void loadTaskMonitorSnapshot(true)
    if (!isLoading.value) {
      void refreshHistory()
    }
  }, 2500)
  // Scroll to bottom after loading history
  await nextTick()
  scrollMessagesToBottom()
  shouldFollowMessages.value = true
})

onBeforeUnmount(() => {
  uploadedFiles.value = []
  if (taskMonitorTimer) {
    clearInterval(taskMonitorTimer)
    taskMonitorTimer = null
  }
})

const handleSend = async (): Promise<void> => {
  if (!userInput.value.trim()) return
  shouldFollowMessages.value = true
  if (uploadedFiles.value.length > 0) {
    const pending = uploadedFiles.value.filter((file) => file.status === 'pending')
    if (pending.length > 0) {
      try {
        const results = await Promise.all(pending.map((file) => window.api.uploadFile(file.sourcePath)))
        const resultMap = new Map(results.map((res, index) => [pending[index].id, res]))
        uploadedFiles.value = uploadedFiles.value.map((file) => {
          if (file.status !== 'pending') return file
          const uploaded = resultMap.get(file.id)
          if (!uploaded) return file
          return {
            ...file,
            resourceUrl: uploaded.resourceUrl,
            status: 'uploaded'
          }
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        showNotice('文件写入失败', message, 'warning')
        return
      }
    }
  }
  await sendMessage(userInput.value)
  userInput.value = ''
  uploadedFiles.value = []
  await loadTaskMonitorSnapshot(true)
}

const handlePickFile = async (): Promise<void> => {
  try {
    const result = await window.api.pickFile()
    const id = self.crypto?.randomUUID ? self.crypto.randomUUID() : `${Date.now()}-${result.fileName}`
    uploadedFiles.value.push({
      id,
      name: result.fileName,
      sourcePath: result.sourcePath,
      size: result.size,
      status: 'pending'
    })
  } catch (error: unknown) {
    if (isFilePickerCancelled(error)) {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    showNotice('文件选择失败', message, 'warning')
  }
}

const formatIsoTime = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}:${seconds}`
}

const requestDeleteFile = (file: UploadedChatFile): void => {
  if (file.status === 'pending') {
    uploadedFiles.value = uploadedFiles.value.filter((item) => item.id !== file.id)
    return
  }
  if (!file.resourceUrl) {
    uploadedFiles.value = uploadedFiles.value.filter((item) => item.id !== file.id)
    return
  }
  pendingDeleteFile.value = file
  showDeleteFileConfirm.value = true
}

const cancelDeleteFile = (): void => {
  pendingDeleteFile.value = null
  showDeleteFileConfirm.value = false
  void restoreInputFocus()
}

const confirmDeleteFile = async (): Promise<void> => {
  const file = pendingDeleteFile.value
  if (!file || !file.resourceUrl) {
    cancelDeleteFile()
    return
  }
  if (deleteFileConfirmLoading.value) return
  deleteFileConfirmLoading.value = true
  try {
    await window.api.deleteFile(file.resourceUrl)
    uploadedFiles.value = uploadedFiles.value.filter((item) => item.id !== file.id)
    pendingDeleteFile.value = null
    showDeleteFileConfirm.value = false
    await restoreInputFocus()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('删除文件失败', message, 'warning')
  } finally {
    deleteFileConfirmLoading.value = false
  }
}

const restoreInputFocus = async (): Promise<void> => {
  await nextTick()
  window.focus()
  if (
    !isLoading.value &&
    !showModelConfig.value &&
    !showMemorySnapshot.value &&
    !showPurgeConfirm.value &&
    !showPersonaResetConfirm.value &&
    !showDeleteFileConfirm.value &&
    !showNoticeDialog.value
  ) {
    composerRef.value?.focusInput()
  }
}

const showNotice = (title: string, message: string, icon: DialogIcon = 'info'): void => {
  noticeTitle.value = title
  noticeMessage.value = message
  noticeIcon.value = icon
  showNoticeDialog.value = true
}

const closeNoticeDialog = async (): Promise<void> => {
  showNoticeDialog.value = false
  await restoreInputFocus()
}

const openPurgeConfirm = (): void => {
  showPurgeConfirm.value = true
}

const openAvatarEditor = (sender: ChatParticipantKey): void => {
  editingParticipantKey.value = sender
  showAvatarEditor.value = true
}

const applyAvatarProfile = async (input: {
  avatarUrl?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}): Promise<void> => {
  const key = editingParticipantKey.value
  try {
    const saved = await window.api.saveAvatarProfile({
      participantKey: key,
      avatarUrl: input.avatarUrl || '',
      avatarScale: input.avatarScale ?? 1,
      avatarOffsetX: input.avatarOffsetX ?? 0,
      avatarOffsetY: input.avatarOffsetY ?? 0
    })
    chatParticipants.value = {
      ...chatParticipants.value,
      [key]: {
        ...chatParticipants.value[key],
        ...saved
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('保存头像失败', message, 'warning')
  }
  void restoreInputFocus()
}

const confirmPurgeAllData = async (): Promise<void> => {
  if (purgeConfirmLoading.value) return
  purgeConfirmLoading.value = true
  try {
    await purgeAllData()
    await loadTaskMonitorSnapshot(true)
    uploadedFiles.value = []
    showPurgeConfirm.value = false
    await restoreInputFocus()
  } finally {
    purgeConfirmLoading.value = false
  }
}

const confirmResetPersonaState = async (): Promise<void> => {
  if (personaResetLoading.value) return
  personaResetLoading.value = true
  try {
    await resetPersonaState()
    await loadMemorySnapshot()
    showPersonaResetConfirm.value = false
    showNotice('人格已重置', '人格状态已恢复到默认初始值。', 'success')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('重置人格失败', message, 'warning')
  } finally {
    personaResetLoading.value = false
  }
}

// Scroll to the bottom when new messages are added
watch(
  messages,
  async () => {
    await nextTick()
    if (shouldFollowMessages.value) {
      scrollMessagesToBottom()
    }
  },
  { deep: true }
)
</script>
