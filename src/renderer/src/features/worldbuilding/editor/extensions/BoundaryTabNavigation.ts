import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

const closingBoundaries = new Set(['"', "'", ')', ']', '}', '”', '’', '）', '】', '》', '」', '』'])

export const BoundaryTabNavigation = Extension.create({
  name: 'boundaryTabNavigation',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state, dispatch } = this.editor.view
        const { selection } = state

        if (!selection.empty) return false
        if (this.editor.isActive('codeBlock')) return false

        const { $from, from } = selection
        if (!$from.parent.isTextblock) return false

        const nextCharacter = $from.parent.textContent[$from.parentOffset] || ''
        if (!closingBoundaries.has(nextCharacter)) return false

        dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)).scrollIntoView())
        return true
      }
    }
  }
})
