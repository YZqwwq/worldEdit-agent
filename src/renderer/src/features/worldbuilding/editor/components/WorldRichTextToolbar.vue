<template>
  <div class="toolbar-shell">
    <div class="toolbar-group">
      <button
        v-for="button in formatButtons"
        :key="button.label"
        type="button"
        class="toolbar-btn"
        :class="{ active: button.isActive() }"
        :title="button.title"
        @click="button.run"
      >
        {{ button.label }}
      </button>
    </div>

    <div class="toolbar-group">
      <button
        v-for="button in blockButtons"
        :key="button.label"
        type="button"
        class="toolbar-btn"
        :class="{ active: button.isActive() }"
        :title="button.title"
        @click="button.run"
      >
        {{ button.label }}
      </button>
    </div>

    <div class="toolbar-group toolbar-group-meta">
      <span class="toolbar-meta">{{ wordCount }} 字词</span>
      <span class="toolbar-meta">{{ characterCount }} 字符</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{
  editor: Editor | null | undefined
}>()

type ToolbarButton = {
  label: string
  title: string
  isActive: () => boolean
  run: () => void
}

const withEditor = (action: (editor: Editor) => void): (() => void) => {
  return () => {
    if (!props.editor) return
    action(props.editor)
  }
}

const formatButtons = computed<ToolbarButton[]>(() => [
  {
    label: 'B',
    title: '加粗',
    isActive: () => props.editor?.isActive('bold') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleBold().run())
  },
  {
    label: 'I',
    title: '斜体',
    isActive: () => props.editor?.isActive('italic') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleItalic().run())
  },
  {
    label: 'S',
    title: '删除线',
    isActive: () => props.editor?.isActive('strike') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleStrike().run())
  }
])

const blockButtons = computed<ToolbarButton[]>(() => [
  {
    label: 'P',
    title: '正文',
    isActive: () => props.editor?.isActive('paragraph') ?? false,
    run: withEditor((editor) => editor.chain().focus().setParagraph().run())
  },
  {
    label: 'H1',
    title: '一级标题',
    isActive: () => props.editor?.isActive('heading', { level: 1 }) ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleHeading({ level: 1 }).run())
  },
  {
    label: 'H2',
    title: '二级标题',
    isActive: () => props.editor?.isActive('heading', { level: 2 }) ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleHeading({ level: 2 }).run())
  },
  {
    label: '•',
    title: '无序列表',
    isActive: () => props.editor?.isActive('bulletList') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleBulletList().run())
  },
  {
    label: '1.',
    title: '有序列表',
    isActive: () => props.editor?.isActive('orderedList') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleOrderedList().run())
  },
  {
    label: '❝',
    title: '引用',
    isActive: () => props.editor?.isActive('blockquote') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleBlockquote().run())
  },
  {
    label: '{}',
    title: '代码块',
    isActive: () => props.editor?.isActive('codeBlock') ?? false,
    run: withEditor((editor) => editor.chain().focus().toggleCodeBlock().run())
  },
  {
    label: '↶',
    title: '撤销',
    isActive: () => false,
    run: withEditor((editor) => editor.chain().focus().undo().run())
  },
  {
    label: '↷',
    title: '重做',
    isActive: () => false,
    run: withEditor((editor) => editor.chain().focus().redo().run())
  }
])

const characterCount = computed(() => props.editor?.storage.characterCount.characters() ?? 0)
const wordCount = computed(() => props.editor?.storage.characterCount.words() ?? 0)
</script>

<style scoped>
.toolbar-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-group-meta {
  margin-left: auto;
}

.toolbar-btn {
  min-width: 40px;
  height: 36px;
  border: 1px solid rgba(205, 161, 92, 0.16);
  border-radius: 12px;
  background: rgba(12, 17, 25, 0.88);
  color: #d7dfeb;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.toolbar-btn:hover {
  border-color: rgba(205, 161, 92, 0.42);
  color: #f5efe4;
}

.toolbar-btn.active {
  background: linear-gradient(135deg, rgba(212, 162, 93, 0.3), rgba(142, 97, 40, 0.3));
  border-color: rgba(212, 162, 93, 0.5);
  color: #f9f1e2;
}

.toolbar-meta {
  font-size: 12px;
  color: #8f99ab;
}
</style>
