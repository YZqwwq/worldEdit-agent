import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDescriptionTool } from '../tools/character/upsertCharacterDescription'
import { characterEditorDraftSchemas } from '../tools/character/shared'

export const characterEditorTools = {
  [getCharacterDetailTool.name]: getCharacterDetailTool,
  [upsertCharacterDescriptionTool.name]: upsertCharacterDescriptionTool
}

export const characterEditorToolkitDraft = {
  implementedTools: Object.keys(characterEditorTools),
  plannedTools: Object.keys(characterEditorDraftSchemas).filter(
    (toolName) => !(toolName in characterEditorTools)
  ),
  draftSchemas: characterEditorDraftSchemas
}
