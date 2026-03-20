export interface WorldEditorShortcutItem {
  label: string
  shortcut: string
}

export interface WorldEditorShortcutGroup {
  title: string
  items: WorldEditorShortcutItem[]
}

export const worldEditorShortcutGroups: WorldEditorShortcutGroup[] = [
  {
    title: '文本样式',
    items: [
      { label: '加粗', shortcut: 'Ctrl/Cmd + B' },
      { label: '斜体', shortcut: 'Ctrl/Cmd + I' },
      { label: '删除线', shortcut: 'Ctrl/Cmd + Shift + X' }
    ]
  },
  {
    title: '标题与段落',
    items: [
      { label: '段落', shortcut: 'Ctrl/Cmd + Alt + 0' },
      { label: '一级标题', shortcut: 'Ctrl/Cmd + Alt + 1' },
      { label: '二级标题', shortcut: 'Ctrl/Cmd + Alt + 2' },
      { label: '三级标题', shortcut: 'Ctrl/Cmd + Alt + 3' }
    ]
  },
  {
    title: '块元素',
    items: [
      { label: '无序列表', shortcut: 'Ctrl/Cmd + Shift + 8' },
      { label: '有序列表', shortcut: 'Ctrl/Cmd + Shift + 7' },
      { label: '引用块', shortcut: 'Ctrl/Cmd + Shift + Q' },
      { label: '代码块', shortcut: 'Ctrl/Cmd + Alt + C' }
    ]
  },
  {
    title: '编辑',
    items: [
      { label: '撤销', shortcut: 'Ctrl/Cmd + Z' },
      { label: '重做', shortcut: 'Ctrl/Cmd + Shift + Z' },
      { label: '保存人物档案', shortcut: 'Ctrl/Cmd + S' }
    ]
  }
]
