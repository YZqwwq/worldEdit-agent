import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'
import type { PersonaScenePolicy } from '@share/cache/AItype/states/personaPolicy'

export interface WorkspaceRelatedToolset {
  id: string
  reason: string
}

interface WorkspaceProfileDefinition {
  id: string
  matches: (workspace: AgentWorkspaceContext) => boolean
  autoToolsets: string[]
  relatedToolsets: WorkspaceRelatedToolset[]
  scenePolicy?: PersonaScenePolicy
}

export interface ResolvedWorkspaceProfile {
  id: string
  autoToolsets: string[]
  relatedToolsets: WorkspaceRelatedToolset[]
  scenePolicy?: PersonaScenePolicy
}

const DOCUMENT_EDITING_PROFILE: WorkspaceProfileDefinition = {
  id: 'document_editing',
  matches: (workspace) => workspace.pageKind === 'document',
  autoToolsets: ['world_document_editor'],
  relatedToolsets: [
    {
      id: 'world_read',
      reason: '需要跨文档核对世界实体、名称、类型或其他真实世界观数据时按需激活。'
    },
    {
      id: 'character_narrative_reader',
      reason: '当前问题需要完整理解某个人物的多份叙事文本，而不只是读取当前文档时按需激活。'
    }
  ],
  scenePolicy: {
    id: 'document_editing',
    label: '文本编辑',
    cognitiveDirections: [
      '把当前文档视为正在工作的真实对象，关注其结构、上下文和世界观内部一致性。',
      '区分文档中已经存在的内容、基于内容形成的判断，以及准备提出的新创作。',
      '页面只提供当前文档的可靠位置，不自动代表用户要求修改；以用户本轮意图决定是否行动。',
      '需要修改时优先观察当前内容和版本，完成后验证实际结果。',
      '工具只在理解或执行任务确有需要时使用，不因进入编辑页而机械调用。'
    ],
    workModes: [
      {
        id: 'focused_edit',
        label: '聚焦编辑',
        whenToUse: '用户要求改写、补充、删减或修正明确内容。',
        directions: [
          '优先关注当前选区、当前标题层级和相邻段落。',
          '控制联想范围，只读取完成修改所需的上下文。'
        ]
      },
      {
        id: 'consistency_review',
        label: '一致性检查',
        whenToUse: '用户要求核对设定、术语、时间线或跨文档一致性。',
        directions: [
          '从当前文档扩展到同一世界观中的直接关联实体和文档。',
          '基于读取到的证据指出一致、冲突和无法确认的部分。'
        ]
      },
      {
        id: 'creative_association',
        label: '创作联想',
        whenToUse: '用户要求联想、扩写、构思可能性或探索设定影响。',
        directions: [
          '可以向人物、地点、势力、规则和相关文档扩展联系。',
          '始终区分已有事实、合理推导与新创作建议。'
        ]
      }
    ]
  }
}

const WORKSPACE_PROFILES: WorkspaceProfileDefinition[] = [DOCUMENT_EDITING_PROFILE]

const cloneScenePolicy = (
  policy: PersonaScenePolicy | undefined
): PersonaScenePolicy | undefined =>
  policy
    ? {
        ...policy,
        cognitiveDirections: [...policy.cognitiveDirections],
        workModes: policy.workModes?.map((mode) => ({
          ...mode,
          directions: [...mode.directions]
        }))
      }
    : undefined

export const resolveWorkspaceProfile = (
  workspace: AgentWorkspaceContext | null | undefined
): ResolvedWorkspaceProfile | undefined => {
  if (!workspace) return undefined
  const profile = WORKSPACE_PROFILES.find((candidate) => candidate.matches(workspace))
  if (!profile) return undefined

  return {
    id: profile.id,
    autoToolsets: [...profile.autoToolsets],
    relatedToolsets: profile.relatedToolsets.map((toolset) => ({ ...toolset })),
    scenePolicy: cloneScenePolicy(profile.scenePolicy)
  }
}
