import { characterEditorDraftSchemas } from '../tools/character/shared'
import { getChildAgentToolEntries, getChildAgentTools } from './childAgentToolRegistry'

export const getCharacterEditorToolRegistry = () =>
  getChildAgentToolEntries('character_editor')

export const getCharacterEditorTools = () => getChildAgentTools('character_editor')

export const characterEditorToolkitDraft = {
  get implementedTools() {
    const tools = getCharacterEditorTools()
    return Object.keys(tools)
  },
  get plannedTools() {
    const tools = getCharacterEditorTools()
    return Object.keys(characterEditorDraftSchemas).filter(
      (toolName) => !(toolName in tools)
    )
  },
  draftSchemas: characterEditorDraftSchemas
}
