<template>
  <div class="toolbar-shell" role="group" aria-label="富文本格式命令">
    <div v-for="(group, groupIndex) in toolbarGroups" :key="groupIndex" class="toolbar-group">
      <template v-for="item in group" :key="item.id">
        <label v-if="item.kind === 'block-select'" class="toolbar-select-wrap" :title="item.title">
          <select
            class="toolbar-select"
            :value="activeBlockType"
            :disabled="!editor"
            :aria-label="item.title"
            @change="setBlockType(($event.target as HTMLSelectElement).value)"
          >
            <option value="paragraph">正文</option>
            <option value="heading-1">一级标题</option>
            <option value="heading-2">二级标题</option>
            <option value="heading-3">三级标题</option>
          </select>
        </label>

        <button
          v-else
          type="button"
          class="toolbar-btn"
          :class="{ active: isActive(item) }"
          :disabled="isDisabled(item)"
          :aria-label="item.title"
          :aria-pressed="item.active ? isActive(item) : undefined"
          :title="item.disabledReason || item.title"
          @mousedown.prevent
          @click="run(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'

type ToolbarButton = {
  kind?: 'button'
  id: string
  label: string
  title: string
  run?: (editor: Editor) => boolean
  active?: (editor: Editor) => boolean
  canRun?: (editor: Editor) => boolean
  disabledReason?: string
}

type ToolbarSelect = {
  kind: 'block-select'
  id: string
  title: string
}

type ToolbarItem = ToolbarButton | ToolbarSelect

const props = defineProps<{
  editor: Editor | null | undefined
}>()

const editorRevision = ref(0)
const refreshToolbar = (): void => {
  editorRevision.value += 1
}

const bindEditor = (editor: Editor | null | undefined): void => {
  editor?.on('transaction', refreshToolbar)
  editor?.on('selectionUpdate', refreshToolbar)
}

const unbindEditor = (editor: Editor | null | undefined): void => {
  editor?.off('transaction', refreshToolbar)
  editor?.off('selectionUpdate', refreshToolbar)
}

watch(
  () => props.editor,
  (editor, previousEditor) => {
    unbindEditor(previousEditor)
    bindEditor(editor)
    refreshToolbar()
  },
  { immediate: true }
)

onBeforeUnmount(() => unbindEditor(props.editor))

const unsupported = (id: string, label: string, title: string): ToolbarButton => ({
  id,
  label,
  title,
  disabledReason: `${title}暂未启用`
})

const toolbarGroups: ToolbarItem[][] = [
  [
    {
      id: 'undo', label: '↶', title: '撤销（Ctrl/Cmd + Z）',
      run: (editor) => editor.chain().focus().undo().run(),
      canRun: (editor) => editor.can().chain().undo().run()
    },
    {
      id: 'redo', label: '↷', title: '重做（Ctrl/Cmd + Shift + Z）',
      run: (editor) => editor.chain().focus().redo().run(),
      canRun: (editor) => editor.can().chain().redo().run()
    },
    unsupported('format-painter', '刷', '格式刷'),
    {
      id: 'clear-format', label: '擦', title: '清除格式',
      run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run()
    }
  ],
  [
    { kind: 'block-select', id: 'block-type', title: '段落样式' },
    unsupported('font-size', '15px⌄', '字号')
  ],
  [
    {
      id: 'bold', label: 'B', title: '加粗（Ctrl/Cmd + B）',
      run: (editor) => editor.chain().focus().toggleBold().run(),
      active: (editor) => editor.isActive('bold')
    },
    {
      id: 'italic', label: 'I', title: '斜体（Ctrl/Cmd + I）',
      run: (editor) => editor.chain().focus().toggleItalic().run(),
      active: (editor) => editor.isActive('italic')
    },
    {
      id: 'strike', label: 'S', title: '删除线（Ctrl/Cmd + Shift + X）',
      run: (editor) => editor.chain().focus().toggleStrike().run(),
      active: (editor) => editor.isActive('strike')
    },
    {
      id: 'underline', label: 'U', title: '下划线（Ctrl/Cmd + U）',
      run: (editor) => editor.chain().focus().toggleUnderline().run(),
      active: (editor) => editor.isActive('underline')
    },
    {
      id: 'inline-code', label: 'T⌄', title: '行内代码',
      run: (editor) => editor.chain().focus().toggleCode().run(),
      active: (editor) => editor.isActive('code')
    }
  ],
  [unsupported('text-color', 'A⌄', '文字颜色'), unsupported('highlight', '⌁⌄', '高亮')],
  [
    unsupported('text-align', '≡⌄', '对齐'),
    {
      id: 'bullet-list', label: '•☰', title: '无序列表（Ctrl/Cmd + Shift + 8）',
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
      active: (editor) => editor.isActive('bulletList')
    },
    {
      id: 'ordered-list', label: '1☰', title: '有序列表（Ctrl/Cmd + Shift + 7）',
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      active: (editor) => editor.isActive('orderedList')
    },
    {
      id: 'indent', label: '▾☰', title: '增加列表缩进（Tab）',
      run: (editor) => editor.chain().focus().sinkListItem('listItem').run(),
      canRun: (editor) => editor.can().chain().sinkListItem('listItem').run()
    }
  ],
  [
    unsupported('task-list', '☑', '待办列表'),
    {
      id: 'link', label: '🔗', title: '添加或编辑链接',
      run: (editor) => {
        const previousUrl = String(editor.getAttributes('link').href || '')
        const nextUrl = window.prompt('输入链接地址；留空将移除链接', previousUrl)
        if (nextUrl === null) return false
        if (!nextUrl.trim()) return editor.chain().focus().extendMarkRange('link').unsetLink().run()
        return editor.chain().focus().extendMarkRange('link').setLink({ href: nextUrl.trim() }).run()
      },
      active: (editor) => editor.isActive('link')
    },
    {
      id: 'blockquote', label: '❝', title: '引用（Ctrl/Cmd + Shift + Q）',
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      active: (editor) => editor.isActive('blockquote')
    },
    {
      id: 'horizontal-rule', label: '─', title: '插入分割线',
      run: (editor) => editor.chain().focus().setHorizontalRule().run()
    }
  ]
]

const activeBlockType = computed(() => {
  editorRevision.value
  const editor = props.editor
  if (!editor) return 'paragraph'
  if (editor.isActive('heading', { level: 1 })) return 'heading-1'
  if (editor.isActive('heading', { level: 2 })) return 'heading-2'
  if (editor.isActive('heading', { level: 3 })) return 'heading-3'
  return 'paragraph'
})

const setBlockType = (value: string): void => {
  const editor = props.editor
  if (!editor) return
  if (value === 'heading-1') editor.chain().focus().setHeading({ level: 1 }).run()
  else if (value === 'heading-2') editor.chain().focus().setHeading({ level: 2 }).run()
  else if (value === 'heading-3') editor.chain().focus().setHeading({ level: 3 }).run()
  else editor.chain().focus().setParagraph().run()
}

const isActive = (item: ToolbarItem): boolean => {
  editorRevision.value
  return item.kind !== 'block-select' && Boolean(props.editor && item.active?.(props.editor))
}

const isDisabled = (item: ToolbarItem): boolean => {
  editorRevision.value
  if (item.kind === 'block-select') return !props.editor
  if (!props.editor || !item.run || item.disabledReason) return true
  return item.canRun ? !item.canRun(props.editor) : false
}

const run = (item: ToolbarItem): void => {
  if (item.kind === 'block-select' || isDisabled(item) || !props.editor || !item.run) return
  item.run(props.editor)
  refreshToolbar()
}
</script>

<style scoped>
.toolbar-shell {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.toolbar-group {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 7px;
  border-left: 1px solid var(--wb-narrative-border);
}

.toolbar-btn,
.toolbar-select {
  height: 28px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  font: inherit;
  font-size: 13px;
  line-height: 1;
}

.toolbar-btn {
  min-width: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  cursor: pointer;
}

.toolbar-btn:not(:disabled):hover,
.toolbar-select:not(:disabled):hover {
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.toolbar-btn.active {
  background: var(--wb-narrative-active);
  color: #315cff;
}

.toolbar-btn:disabled,
.toolbar-select:disabled {
  color: var(--wb-narrative-text-faint);
  cursor: default;
  opacity: 0.58;
}

.toolbar-select-wrap {
  display: inline-flex;
}

.toolbar-select {
  max-width: 88px;
  padding: 0 4px;
  outline: none;
  cursor: pointer;
}

.toolbar-btn:focus-visible,
.toolbar-select:focus-visible {
  outline: 2px solid rgba(49, 92, 255, 0.35);
  outline-offset: -2px;
}
</style>
