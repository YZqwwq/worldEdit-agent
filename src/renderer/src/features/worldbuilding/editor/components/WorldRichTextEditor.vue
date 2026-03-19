<template>
  <div class="editor-shell">
    <WorldRichTextToolbar :editor="editor" />

    <div class="editor-frame" :class="{ 'editor-frame-dark': theme === 'dark' }" :style="editorStyle">
      <EditorContent v-if="editor" :editor="editor" class="editor-content" />
    </div>

    <div v-if="showShortcutHint" class="editor-hint">
      `Tab` 会优先越过右侧闭合引号或括号，便于继续输入。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { createWorldbuildingEditorExtensions } from '../extensions/createWorldbuildingEditorExtensions'
import {
  normalizeWorldRichTextAppearance,
  type WorldRichTextAppearance
} from '../model/editorAppearance'
import { normalizeRichTextContent } from '../utils/richTextContent'
import WorldRichTextToolbar from './WorldRichTextToolbar.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    showShortcutHint?: boolean
    theme?: 'light' | 'dark'
    appearance?: Partial<WorldRichTextAppearance> | null
  }>(),
  {
    placeholder: '开始输入内容',
    showShortcutHint: false,
    theme: 'dark'
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const extensions = createWorldbuildingEditorExtensions(props.placeholder)

const editor = useEditor({
  extensions,
  content: normalizeRichTextContent(props.modelValue),
  editorProps: {
    attributes: {
      class: 'worldbuilding-tiptap'
    }
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  }
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return

    const normalized = normalizeRichTextContent(value)
    if (editor.value.getHTML() === normalized) return

    editor.value.commands.setContent(normalized, {
      emitUpdate: false
    })
  }
)

const theme = computed(() => props.theme)
const normalizedAppearance = computed(() => normalizeWorldRichTextAppearance(props.appearance))
const editorStyle = computed(() => ({
  '--wb-font-scale': String(normalizedAppearance.value.fontScale),
  '--wb-line-height': String(normalizedAppearance.value.lineHeight),
  '--wb-content-width': `${normalizedAppearance.value.contentWidth}px`,
  '--wb-paragraph-spacing': String(normalizedAppearance.value.paragraphSpacing),
  '--wb-heading-scale': String(normalizedAppearance.value.headingScale)
}))
</script>

<style scoped>
.editor-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-frame {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(205, 161, 92, 0.12);
  background: rgba(248, 250, 255, 0.98);
}

.editor-frame-dark {
  background:
    linear-gradient(180deg, rgba(17, 22, 30, 0.98), rgba(11, 15, 22, 0.98));
}

.editor-content {
  height: 100%;
}

.editor-hint {
  font-size: 12px;
  color: #8f99ab;
}

:deep(.editor-content .tiptap) {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px;
  outline: none;
  max-width: min(100%, var(--wb-content-width, 860px));
  margin: 0 auto;
  color: #edf2f7;
  line-height: var(--wb-line-height, 1.75);
  font-size: calc(18px * var(--wb-font-scale, 1));
}

:deep(.editor-content .tiptap p:first-child),
:deep(.editor-content .tiptap h1:first-child),
:deep(.editor-content .tiptap h2:first-child),
:deep(.editor-content .tiptap h3:first-child) {
  margin-top: 0;
}

:deep(.editor-content .tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: rgba(143, 153, 171, 0.72);
}

:deep(.editor-content .tiptap h1) {
  margin: 1.2em 0 0.55em;
  font-size: calc(28px * var(--wb-heading-scale, 1));
  line-height: 1.15;
  color: #f5efe4;
}

:deep(.editor-content .tiptap h2) {
  margin: 1.1em 0 0.5em;
  font-size: calc(22px * var(--wb-heading-scale, 1));
  line-height: 1.2;
  color: #e7d2ad;
}

:deep(.editor-content .tiptap h3) {
  margin: 1em 0 0.45em;
  font-size: calc(18px * var(--wb-heading-scale, 1));
  line-height: 1.3;
  color: #d4dde8;
}

:deep(.editor-content .tiptap p) {
  margin: 0 0 calc(1em * var(--wb-paragraph-spacing, 0.75));
}

:deep(.editor-content .tiptap blockquote) {
  margin: 1em 0;
  padding-left: 16px;
  border-left: 3px solid rgba(212, 162, 93, 0.65);
  color: #cbd5e1;
}

:deep(.editor-content .tiptap ul),
:deep(.editor-content .tiptap ol) {
  padding-left: 1.3em;
}

:deep(.editor-content .tiptap code) {
  padding: 0.15em 0.35em;
  border-radius: 6px;
  background: rgba(212, 162, 93, 0.12);
  color: #f7dfb9;
}

:deep(.editor-content .tiptap pre) {
  margin: 1em 0;
  padding: 16px;
  border-radius: 16px;
  background: rgba(7, 10, 15, 0.96);
  overflow-x: auto;
}

:deep(.editor-content .tiptap pre code) {
  padding: 0;
  background: transparent;
  color: #d7dfeb;
}

:deep(.editor-content .tiptap hr) {
  margin: 1.4em 0;
  border: 0;
  border-top: 1px solid rgba(205, 161, 92, 0.2);
}

:deep(.editor-content .tiptap strong) {
  color: #f5efe4;
}
</style>
