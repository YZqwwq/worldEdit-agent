import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import type { AnyExtension } from '@tiptap/core'
import { BoundaryTabNavigation } from './BoundaryTabNavigation'
import { WorldEditorKeyboardShortcuts } from './WorldEditorKeyboardShortcuts'

export const createWorldbuildingEditorExtensions = (placeholder: string): AnyExtension[] => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3]
    }
  }),
  Placeholder.configure({
    placeholder,
    emptyEditorClass: 'is-editor-empty'
  }),
  CharacterCount.configure(),
  WorldEditorKeyboardShortcuts,
  BoundaryTabNavigation
]
