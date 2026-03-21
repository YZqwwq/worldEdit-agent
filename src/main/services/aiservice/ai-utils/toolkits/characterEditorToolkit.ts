import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { characterEditorDraftSchemas } from '../tools/character/shared'

export const characterEditorTools = {
  [getCharacterDetailTool.name]: getCharacterDetailTool
}

export const characterEditorToolkitDraft = {
  implementedTools: Object.keys(characterEditorTools),
  plannedTools: Object.keys(characterEditorDraftSchemas).filter(
    (toolName) => !(toolName in characterEditorTools)
  ),
  draftSchemas: characterEditorDraftSchemas
}
