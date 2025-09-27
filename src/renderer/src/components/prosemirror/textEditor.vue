<template>
  <div class="text-editor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button 
        @click="toggleBold" 
        :class="{ active: isBold }"
        class="toolbar-btn"
        title="粗体"
      >
        <strong>B</strong>
      </button>
      <button 
        @click="toggleItalic" 
        :class="{ active: isItalic }"
        class="toolbar-btn"
        title="斜体"
      >
        <em>I</em>
      </button>
      <button 
        @click="toggleHeading(1)" 
        :class="{ active: isHeading(1) }"
        class="toolbar-btn"
        title="标题1"
      >
        H1
      </button>
      <button 
        @click="toggleHeading(2)" 
        :class="{ active: isHeading(2) }"
        class="toolbar-btn"
        title="标题2"
      >
        H2
      </button>
      <button 
        @click="toggleBulletList" 
        :class="{ active: isBulletList }"
        class="toolbar-btn"
        title="无序列表"
      >
        •
      </button>
      <button 
        @click="toggleOrderedList" 
        :class="{ active: isOrderedList }"
        class="toolbar-btn"
        title="有序列表"
      >
        1.
      </button>
      <div class="toolbar-divider"></div>
      <button 
        @click="undo" 
        :disabled="!canUndo"
        class="toolbar-btn"
        title="撤销"
      >
        ↶
      </button>
      <button 
        @click="redo" 
        :disabled="!canRedo"
        class="toolbar-btn"
        title="重做"
      >
        ↷
      </button>
    </div>
    
    <!-- 编辑器容器 -->
    <div ref="editorRef" class="editor-content"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema, DOMParser } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { keymap } from 'prosemirror-keymap'
import { history, undo as undoCommand, redo as redoCommand } from 'prosemirror-history'
import { baseKeymap } from 'prosemirror-commands'
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'

// Props
interface Props {
  modelValue?: string
  placeholder?: string
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '开始输入...',
  readonly: false
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

// 创建扩展的schema，包含列表支持
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks
})

// 响应式数据
const editorRef = ref<HTMLElement>()
let editorView: EditorView | null = null
const isBold = ref(false)
const isItalic = ref(false)
const isBulletList = ref(false)
const isOrderedList = ref(false)
const canUndo = ref(false)
const canRedo = ref(false)

// 初始化编辑器
const initEditor = () => {
  if (!editorRef.value) return

  const state = EditorState.create({
    schema: mySchema,
    plugins: [
      history(),
      keymap({
        'Mod-z': undoCommand,
        'Mod-y': redoCommand,
        'Mod-Shift-z': redoCommand,
        'Mod-b': toggleMark(mySchema.marks.strong),
        'Mod-i': toggleMark(mySchema.marks.em)
      }),
      keymap(baseKeymap)
    ]
  })

  editorView = new EditorView(editorRef.value, {
    state,
    dispatchTransaction(transaction) {
      const newState = editorView!.state.apply(transaction)
      editorView!.updateState(newState)
      
      // 更新工具栏状态
      updateToolbarState(newState)
      
      // 发出内容变化事件
      const content = getEditorContent()
      emit('update:modelValue', content)
      emit('change', content)
    },
    editable: () => !props.readonly,
    attributes: {
      class: 'prosemirror-editor',
      'data-placeholder': props.placeholder
    }
  })

  // 初始化内容
  if (props.modelValue) {
    setEditorContent(props.modelValue)
  }

  // 初始化工具栏状态
  updateToolbarState(editorView.state)
}

// 更新工具栏状态
const updateToolbarState = (state: EditorState) => {
  const { $from, to, empty } = state.selection
  
  if (empty) {
    isBold.value = mySchema.marks.strong.isInSet(state.storedMarks || $from.marks()) !== undefined
    isItalic.value = mySchema.marks.em.isInSet(state.storedMarks || $from.marks()) !== undefined
  } else {
    isBold.value = state.doc.rangeHasMark($from.pos, to, mySchema.marks.strong)
    isItalic.value = state.doc.rangeHasMark($from.pos, to, mySchema.marks.em)
  }

  // 检查列表状态
  const { $head } = state.selection
  const bulletList = mySchema.nodes.bullet_list
  const orderedList = mySchema.nodes.ordered_list
  
  isBulletList.value = !!bulletList && $head.parent.type === bulletList
  isOrderedList.value = !!orderedList && $head.parent.type === orderedList

  // 检查撤销/重做状态
  canUndo.value = undoCommand(state)
  canRedo.value = redoCommand(state)
}

// 检查是否为指定级别的标题
const isHeading = (level: number) => {
  if (!editorView) return false
  const { $from } = editorView.state.selection
  return $from.parent.type === mySchema.nodes.heading && $from.parent.attrs.level === level
}

// 工具栏操作方法
const toggleBold = () => {
  if (!editorView) return
  const command = toggleMark(mySchema.marks.strong)
  command(editorView.state, editorView.dispatch)
  editorView.focus()
}

const toggleItalic = () => {
  if (!editorView) return
  const command = toggleMark(mySchema.marks.em)
  command(editorView.state, editorView.dispatch)
  editorView.focus()
}

const toggleHeading = (level: number) => {
  if (!editorView) return
  const command = setBlockType(mySchema.nodes.heading, { level })
  command(editorView.state, editorView.dispatch)
  editorView.focus()
}

const toggleBulletList = () => {
  if (!editorView) return
  const command = wrapIn(mySchema.nodes.bullet_list)
  command(editorView.state, editorView.dispatch)
  editorView.focus()
}

const toggleOrderedList = () => {
  if (!editorView) return
  const command = wrapIn(mySchema.nodes.ordered_list)
  command(editorView.state, editorView.dispatch)
  editorView.focus()
}

const undo = () => {
  if (!editorView) return
  undoCommand(editorView.state, editorView.dispatch)
  editorView.focus()
}

const redo = () => {
  if (!editorView) return
  redoCommand(editorView.state, editorView.dispatch)
  editorView.focus()
}

// 获取编辑器内容
const getEditorContent = (): string => {
  if (!editorView) return ''
  const div = document.createElement('div')
  const fragment = DOMParser.fromSchema(mySchema).serializeFragment(editorView.state.doc.content)
  div.appendChild(fragment)
  return div.innerHTML
}

// 设置编辑器内容
const setEditorContent = (html: string) => {
  if (!editorView) return
  const div = document.createElement('div')
  div.innerHTML = html
  const doc = DOMParser.fromSchema(mySchema).parse(div)
  const state = EditorState.create({
    doc,
    plugins: editorView.state.plugins
  })
  editorView.updateState(state)
}

// 监听props变化
watch(() => props.modelValue, (newValue) => {
  if (newValue !== getEditorContent()) {
    setEditorContent(newValue || '')
  }
})

// 生命周期
onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  if (editorView) {
    editorView.destroy()
  }
})

// 暴露方法给父组件
defineExpose({
  getContent: getEditorContent,
  setContent: setEditorContent,
  focus: () => editorView?.focus()
})
</script>

<style scoped>
.text-editor {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  gap: 4px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #495057;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: #e9ecef;
  color: #212529;
}

.toolbar-btn.active {
  background: #007bff;
  color: white;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn:disabled:hover {
  background: transparent;
  color: #495057;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #dee2e6;
  margin: 0 4px;
}

.editor-content {
  min-height: 200px;
  max-height: 500px;
  overflow-y: auto;
}

:deep(.prosemirror-editor) {
  padding: 16px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: #212529;
}

:deep(.prosemirror-editor p) {
  margin: 0 0 12px 0;
}

:deep(.prosemirror-editor p:last-child) {
  margin-bottom: 0;
}

:deep(.prosemirror-editor h1) {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #212529;
}

:deep(.prosemirror-editor h2) {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 14px 0;
  color: #212529;
}

:deep(.prosemirror-editor h3) {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #212529;
}

:deep(.prosemirror-editor strong) {
  font-weight: 600;
}

:deep(.prosemirror-editor em) {
  font-style: italic;
}

:deep(.prosemirror-editor ul) {
  margin: 0 0 12px 0;
  padding-left: 24px;
}

:deep(.prosemirror-editor ol) {
  margin: 0 0 12px 0;
  padding-left: 24px;
}

:deep(.prosemirror-editor li) {
  margin-bottom: 4px;
}

:deep(.prosemirror-editor[data-placeholder]:empty::before) {
  content: attr(data-placeholder);
  color: #6c757d;
  pointer-events: none;
  position: absolute;
}

:deep(.prosemirror-editor:focus) {
  outline: none;
}
</style>