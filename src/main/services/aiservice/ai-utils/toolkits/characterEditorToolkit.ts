import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDemographicTool } from '../tools/character/upsertCharacterDemographic'
import { upsertCharacterProfileTool } from '../tools/character/upsertCharacterProfile'
import { characterEditorDraftSchemas } from '../tools/character/shared'

export const characterEditorTools = {
  [getCharacterDetailTool.name]: getCharacterDetailTool,
  [upsertCharacterProfileTool.name]: upsertCharacterProfileTool,
  [upsertCharacterDemographicTool.name]: upsertCharacterDemographicTool
}

export const characterEditorToolkitDraft = {
  implementedTools: Object.keys(characterEditorTools),
  plannedTools: Object.keys(characterEditorDraftSchemas).filter(
    (toolName) => !(toolName in characterEditorTools)
  ),
  draftSchemas: characterEditorDraftSchemas
}
