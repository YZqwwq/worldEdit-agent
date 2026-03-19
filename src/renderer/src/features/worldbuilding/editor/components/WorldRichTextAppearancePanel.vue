<template>
  <aside class="appearance-panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow">Editor Appearance</div>
        <h3>编辑器效果</h3>
      </div>

      <button type="button" class="reset-btn" @click="resetToDefault">重置</button>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <span class="setting-label">字体倍率</span>
        <strong>{{ draft.fontScale.toFixed(2) }}</strong>
      </div>
      <input v-model.number="draft.fontScale" type="range" min="0.9" max="1.4" step="0.05" />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <span class="setting-label">行高</span>
        <strong>{{ draft.lineHeight.toFixed(2) }}</strong>
      </div>
      <input v-model.number="draft.lineHeight" type="range" min="1.5" max="2.2" step="0.05" />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <span class="setting-label">正文宽度</span>
        <strong>{{ Math.round(draft.contentWidth) }}px</strong>
      </div>
      <input v-model.number="draft.contentWidth" type="range" min="640" max="1200" step="20" />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <span class="setting-label">段落间距</span>
        <strong>{{ draft.paragraphSpacing.toFixed(2) }}</strong>
      </div>
      <input v-model.number="draft.paragraphSpacing" type="range" min="0.5" max="1.4" step="0.05" />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <span class="setting-label">标题倍率</span>
        <strong>{{ draft.headingScale.toFixed(2) }}</strong>
      </div>
      <input v-model.number="draft.headingScale" type="range" min="0.9" max="1.35" step="0.05" />
    </label>

    <div class="panel-tip">当前设置会跟随人物档案一并保存到数据库。</div>
  </aside>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import {
  DEFAULT_WORLD_RICH_TEXT_APPEARANCE,
  normalizeWorldRichTextAppearance,
  type WorldRichTextAppearance
} from '../model/editorAppearance'

const props = defineProps<{
  modelValue: WorldRichTextAppearance
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: WorldRichTextAppearance): void
}>()

const draft = reactive<WorldRichTextAppearance>(normalizeWorldRichTextAppearance(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    Object.assign(draft, normalizeWorldRichTextAppearance(value))
  },
  { deep: true }
)

watch(
  draft,
  (value) => {
    emit('update:modelValue', normalizeWorldRichTextAppearance(value))
  },
  { deep: true }
)

const resetToDefault = (): void => {
  Object.assign(draft, DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
}
</script>

<style scoped>
.appearance-panel {
  width: 320px;
  border-radius: 20px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  background: rgba(10, 14, 20, 0.96);
  box-shadow: 0 26px 60px rgba(2, 4, 8, 0.42);
  padding: 16px;
  backdrop-filter: blur(12px);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8f99ab;
}

.panel-head h3 {
  margin: 6px 0 0;
  font-size: 18px;
  color: #f4ede1;
}

.reset-btn {
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(16, 21, 29, 0.88);
  color: #e7d2ad;
  font: inherit;
  cursor: pointer;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.setting-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-label {
  color: #d7dfeb;
  font-size: 13px;
}

.setting-copy strong {
  font-size: 12px;
  color: #e7d2ad;
}

.setting-row input[type='range'] {
  width: 100%;
  accent-color: #d4a25d;
}

.panel-tip {
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #8f99ab;
}
</style>
