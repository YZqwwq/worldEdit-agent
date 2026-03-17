<template>
  <teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
      @click.self="handleCancel"
    >
      <div class="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 class="text-base font-semibold text-slate-900">编辑头像</h3>
            <p class="mt-1 text-sm text-slate-500">
              上传图片后可拖动位置并缩放，圆形区域即最终头像效果。
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            @click="handleCancel"
          >
            ✕
          </button>
        </div>

        <div class="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                @click="pickImage"
              >
                选择图片
              </button>
              <button
                type="button"
                class="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!workingUrl"
                @click="resetTransform"
              >
                重置位置
              </button>
              <button
                type="button"
                class="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!workingUrl"
                @click="clearImage"
              >
                清除图片
              </button>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="hidden"
                @change="handleFileChange"
              />
            </div>

            <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6">
              <div class="mx-auto flex max-w-[360px] flex-col items-center gap-4">
                <div
                  ref="previewRef"
                  class="relative h-[260px] w-[260px] overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-[0_18px_40px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 select-none"
                  @pointerdown="startDrag"
                >
                  <img
                    v-if="workingUrl"
                    :src="workingUrl"
                    alt="头像预览"
                    class="absolute h-full w-full object-cover pointer-events-none"
                    :style="previewImageStyle"
                    draggable="false"
                  />
                  <div
                    v-else
                    class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-100 text-5xl font-semibold text-slate-400"
                  >
                    {{ fallbackAvatarText }}
                  </div>
                </div>
                <p class="text-xs text-slate-500">拖动图片调整位置，滚轮或滑块可缩放。</p>
              </div>
            </div>
          </section>

          <aside class="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <div>
              <div class="text-sm font-semibold text-slate-800">头像展示</div>
              <p class="mt-1 text-xs leading-5 text-slate-500">
                这是头像缩小后在聊天中的实际观感。
              </p>
            </div>

            <div class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <ChatAvatar
                :accent="participant?.accent"
                :avatar-text="fallbackAvatarText"
                :avatar-url="workingUrl"
                :avatar-alt="participant?.avatarAlt || participant?.nickname || 'avatar'"
                :avatar-scale="workingScale"
                :avatar-offset-x="workingOffsetX"
                :avatar-offset-y="workingOffsetY"
              />
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-800">
                  {{ participant?.nickname || '未命名角色' }}
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ participant?.label || 'CHAT PARTICIPANT' }}
                </div>
              </div>
            </div>

            <label class="flex flex-col gap-2 text-sm text-slate-700">
              缩放
              <input
                v-model.number="workingScale"
                type="range"
                min="1"
                max="3"
                step="0.01"
                :disabled="!workingUrl"
              />
              <span class="text-xs text-slate-500">
                {{ workingScale.toFixed(2) }}x
              </span>
            </label>
          </aside>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            class="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="applyAvatar"
          >
            应用头像
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ChatAvatar from './ChatAvatar.vue'
import type { ChatParticipantProfile } from '../types'

type AvatarEditorPayload = {
  avatarUrl?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}

const props = defineProps<{
  modelValue: boolean
  participant?: ChatParticipantProfile | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'apply', value: AvatarEditorPayload): void
  (e: 'cancel'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const workingUrl = ref('')
const workingScale = ref(1)
const workingOffsetX = ref(0)
const workingOffsetY = ref(0)
const dragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragOriginX = ref(0)
const dragOriginY = ref(0)

const fallbackAvatarText = computed(() => props.participant?.avatarText || 'AI')

const clampScale = (value: number): number => Math.min(3, Math.max(1, Number.isFinite(value) ? value : 1))
const clampOffset = (value: number): number => Math.min(0.8, Math.max(-0.8, Number.isFinite(value) ? value : 0))

const syncFromParticipant = (): void => {
  workingUrl.value = props.participant?.avatarUrl || ''
  workingScale.value = clampScale(props.participant?.avatarScale ?? 1)
  workingOffsetX.value = clampOffset(props.participant?.avatarOffsetX ?? 0)
  workingOffsetY.value = clampOffset(props.participant?.avatarOffsetY ?? 0)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      syncFromParticipant()
    }
  },
  { immediate: true }
)

watch(
  () => props.participant,
  () => {
    if (props.modelValue) {
      syncFromParticipant()
    }
  }
)

watch(workingScale, (value) => {
  workingScale.value = clampScale(value)
})

const previewImageStyle = computed(() => ({
  left: `calc(50% + ${workingOffsetX.value * 100}%)`,
  top: `calc(50% + ${workingOffsetY.value * 100}%)`,
  transform: `translate(-50%, -50%) scale(${workingScale.value})`,
  transformOrigin: 'center center'
}))

const pickImage = (): void => {
  fileInputRef.value?.click()
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })

const handleFileChange = async (event: Event): Promise<void> => {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  try {
    const dataUrl = await readFileAsDataUrl(file)
    workingUrl.value = dataUrl
    workingScale.value = 1
    workingOffsetX.value = 0
    workingOffsetY.value = 0
  } finally {
    if (target) target.value = ''
  }
}

const resetTransform = (): void => {
  workingScale.value = 1
  workingOffsetX.value = 0
  workingOffsetY.value = 0
}

const clearImage = (): void => {
  workingUrl.value = ''
  resetTransform()
}

const updateOffsetByDelta = (deltaX: number, deltaY: number): void => {
  const size = previewRef.value?.clientWidth || 260
  workingOffsetX.value = clampOffset(dragOriginX.value + deltaX / size)
  workingOffsetY.value = clampOffset(dragOriginY.value + deltaY / size)
}

const startDrag = (event: PointerEvent): void => {
  if (!workingUrl.value) return
  dragging.value = true
  dragStartX.value = event.clientX
  dragStartY.value = event.clientY
  dragOriginX.value = workingOffsetX.value
  dragOriginY.value = workingOffsetY.value
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDrag)
}

const handlePointerMove = (event: PointerEvent): void => {
  if (!dragging.value) return
  updateOffsetByDelta(event.clientX - dragStartX.value, event.clientY - dragStartY.value)
}

const stopDrag = (): void => {
  dragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDrag)
}

const handleCancel = (): void => {
  stopDrag()
  emit('cancel')
  emit('update:modelValue', false)
}

const applyAvatar = (): void => {
  emit('apply', {
    avatarUrl: workingUrl.value || '',
    avatarScale: workingScale.value,
    avatarOffsetX: workingOffsetX.value,
    avatarOffsetY: workingOffsetY.value
  })
  emit('update:modelValue', false)
}

const handleWheel = (event: WheelEvent): void => {
  if (!workingUrl.value) return
  event.preventDefault()
  const nextScale = workingScale.value + (event.deltaY < 0 ? 0.06 : -0.06)
  workingScale.value = clampScale(nextScale)
}

watch(
  previewRef,
  (element, previous) => {
    previous?.removeEventListener('wheel', handleWheel as EventListener)
    element?.addEventListener('wheel', handleWheel as EventListener, { passive: false })
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  stopDrag()
  previewRef.value?.removeEventListener('wheel', handleWheel as EventListener)
})
</script>
