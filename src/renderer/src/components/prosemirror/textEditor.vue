<template>
  <div class="text-editor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button 
        @click="toggleBold" 
        :class="{ active: isBold }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="粗体 (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button 
        @click="toggleItalic" 
        :class="{ active: isItalic }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="斜体 (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button 
        @click="toggleHeading(1)" 
        :class="{ active: isHeading(1) }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="标题1"
      >
        H1
      </button>
      <button 
        @click="toggleHeading(2)" 
        :class="{ active: isHeading(2) }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="标题2"
      >
        H2
      </button>
      <button 
        @click="toggleBulletList" 
        :class="{ active: isBulletList }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="无序列表"
      >
        •
      </button>
      <button 
        @click="toggleOrderedList" 
        :class="{ active: isOrderedList }"
        :disabled="readonly || loading"
        class="toolbar-btn"
        title="有序列表"
      >
        1.
      </button>
      <div class="toolbar-divider"></div>
      <button 
        @click="undo" 
        :disabled="!canUndo || readonly || loading"
        class="toolbar-btn"
        title="撤销 (Ctrl+Z)"
      >
        ↶
      </button>
      <button 
        @click="redo" 
        :disabled="!canRedo || readonly || loading"
        class="toolbar-btn"
        title="重做 (Ctrl+Y)"
      >
        ↷
      </button>
      
      <!-- 状态指示器 -->
      <div class="status-indicators">
        <span v-if="loading" class="status loading" title="加载中...">📄</span>
        <span v-if="saving" class="status saving" title="保存中...">💾</span>
      </div>
    </div>
    
    <!-- 编辑器容器 -->
    <div 
      ref="editorRef" 
      class="editor-content"
      :class="{ readonly, loading }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { keymap } from 'prosemirror-keymap'
import { history, undo as undoCommand, redo as redoCommand } from 'prosemirror-history'
import { baseKeymap } from 'prosemirror-commands'
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'
import { worldContentTextService } from '../../services/serviceImpl/worldContentText'

// Props
interface Props {
  modelValue?: string
  placeholder?: string
  readonly?: boolean
  worldId?: string // 新增worldId属性
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '开始输入...',
  readonly: false,
  worldId: ''
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
const loading = ref(false)
const saving = ref(false)
let saveTimeout: NodeJS.Timeout | null = null

// 加载世界观文本内容
const loadWorldContent = async () => {
  if (!props.worldId) return
  
  try {
    loading.value = true
    const worldContentText = await worldContentTextService.getWorldContentText(props.worldId)
    const description = worldContentText.text.description || ''
    
    // 如果有内容且编辑器已初始化，设置内容
    if (description && editorView) {
      setEditorContent(description)
    }
    
    return description
  } catch (error) {
    console.error('加载世界观文本内容失败:', error)
    return ''
  } finally {
    loading.value = false
  }
}

// 自动保存内容
const autoSaveContent = async (content: string) => {
  if (!props.worldId || saving.value) return
  
  // 清除之前的保存定时器
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // 设置新的保存定时器（防抖，2秒后保存）
  saveTimeout = setTimeout(async () => {
    try {
      saving.value = true
      await worldContentTextService.saveWorldContentText(props.worldId!, {
        description: content
      })
      console.log('内容已自动保存')
    } catch (error) {
      console.error('自动保存失败:', error)
    } finally {
      saving.value = false
    }
  }, 2000)
}

// 初始化编辑器
const initEditor = async () => {
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
      
      // 如果有worldId，自动保存内容
      if (props.worldId) {
        autoSaveContent(content)
      }
    },
    editable: () => !props.readonly,
    attributes: {
      class: 'prosemirror-editor',
      'data-placeholder': props.placeholder
    }
  })

  // 如果有worldId，加载世界观内容
  if (props.worldId) {
    const content = await loadWorldContent()
    if (content) {
      setEditorContent(content)
    }
  } else if (props.modelValue) {
    // 否则使用modelValue
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
  const fragment = DOMSerializer.fromSchema(mySchema).serializeFragment(editorView.state.doc.content)
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
  if (editorView && newValue !== getEditorContent() && !props.worldId) {
    // 只有在没有worldId时才使用modelValue
    setEditorContent(newValue || '')
  }
})

// 监听 worldId 变化
watch(() => props.worldId, async (newWorldId) => {
  if (newWorldId && editorView) {
    await loadWorldContent()
  }
})

// 生命周期
onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  // 清理定时器
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
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
  border-radius: 4px;
  background: white;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1; /* 确保占据全部可用空间 */
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  gap: 4px;
}

.status-indicators {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.status {
  font-size: 14px;
  opacity: 0.7;
}

.status.loading {
  animation: pulse 1.5s ease-in-out infinite;
}

.status.saving {
  animation: bounce 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
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
  flex: 1;
  min-height: 0; /* 移除固定最小高度 */
  overflow-y: auto;
  height: 100%; /* 确保占据全部高度 */
}

:deep(.prosemirror-editor) {
  padding: 16px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: #212529;
  min-height: 100%; /* 确保编辑器内容占据全部高度 */
  box-sizing: border-box;
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

.editor-content.readonly {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.editor-content.readonly :deep(.prosemirror-editor) {
  color: #666;
}

.editor-content.loading {
  opacity: 0.6;
  pointer-events: none;
  position: relative;
}

.editor-content.loading::before {
  content: '加载中...';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #999;
  font-size: 14px;
  z-index: 10;
}
</style>