import { characterEditorDraftSchemas } from '../tools/character/shared'
import { getToolEntriesForExecutor, getToolsForExecutor } from './unifiedToolRegistry'

export const characterEditorToolRegistry = getToolEntriesForExecutor('character_editor')
export const characterEditorTools = getToolsForExecutor('character_editor')

export const characterEditorToolkitDraft = {
  implementedTools: Object.keys(characterEditorTools),
  plannedTools: Object.keys(characterEditorDraftSchemas).filter(
    (toolName) => !(toolName in characterEditorTools)
  ),
  draftSchemas: characterEditorDraftSchemas
}
