import type { AgentTool } from '../core/agentTool'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDescriptionTool } from '../tools/character/upsertCharacterDescription'
import { characterEditorDraftSchemas } from '../tools/character/shared'

export type ChildAgentToolkitEntry = {
  executorKind: TaskExecutorKind
  tool: AgentTool
  access: 'read' | 'write'
}

export const childAgentToolkitRegistry: Record<TaskExecutorKind, ChildAgentToolkitEntry[]> = {
  general_task_worker: [],
  code_worker: [],
  doc_worker: [],
  character_editor: [
    { executorKind: 'character_editor', tool: getCharacterDetailTool, access: 'read' },
    { executorKind: 'character_editor', tool: upsertCharacterDescriptionTool, access: 'write' }
  ],
  tool_builder: [],
  architecture_analyst: [],
  general_research: []
}

export const characterEditorTools = Object.fromEntries(
  childAgentToolkitRegistry.character_editor.map((entry) => [entry.tool.name, entry.tool])
) as Record<string, AgentTool>

export const characterEditorToolkitDraft = {
  implementedTools: Object.keys(characterEditorTools),
  plannedTools: Object.keys(characterEditorDraftSchemas).filter(
    (toolName) => !(toolName in characterEditorTools)
  ),
  draftSchemas: characterEditorDraftSchemas
}

