import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import {
  getDefaultExpressionPrompt,
  getExpressionPromptProfileById,
  toExpressionPromptProfileState
} from '../../../prompt/main_agent/persona/expressionPromptProfiles'
import type { ExpressionPromptProfileState } from '@share/cache/AItype/states/expressionPromptProfile'

export const selectableExpressionProfileIdSchema = z.enum([
  'calm',
  'joyful',
  'excited',
  'angry',
  'sad',
  'hurt',
  'uneasy'
])

export type SelectableExpressionProfileId = z.infer<typeof selectableExpressionProfileIdSchema>

const selectExpressionProfileInputSchema = z.object({
  profileId: selectableExpressionProfileIdSchema.describe(
    '根据 Agent 当前真实情绪选择：calm=平静，joyful=愉悦，excited=激动，angry=生气，sad=悲伤，hurt=受伤，uneasy=不安。'
  ),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe('简要说明当前心理背景为何适合这一表达方案；不要按页面或任务类型选择。')
})

const selectExpressionProfileOutputSchema = z.object({
  profileId: selectableExpressionProfileIdSchema,
  title: z.string(),
  summary: z.string(),
  reason: z.string()
})

export const toSelectedExpressionProfileState = (
  profileId: SelectableExpressionProfileId,
  stablePrompt = getDefaultExpressionPrompt()
): ExpressionPromptProfileState => {
  const profile = getExpressionPromptProfileById(profileId)
  return toExpressionPromptProfileState(profile, `${stablePrompt.trim()}\n\n${profile.prompt}`)
}

export const resolveExpressionProfileSelection = (input: {
  toolName: string
  ok: boolean
  data: Record<string, unknown> | undefined
  current: ExpressionPromptProfileState | undefined
}): ExpressionPromptProfileState | undefined => {
  if (!input.ok || input.toolName !== 'select_expression_profile') return input.current
  const profileId = selectableExpressionProfileIdSchema.safeParse(input.data?.profileId)
  return profileId.success
    ? toSelectedExpressionProfileState(
        profileId.data,
        input.current?.id === 'default' ? input.current.prompt : undefined
      )
    : input.current
}

export const selectExpressionProfileTool = defineAgentTool({
  name: 'select_expression_profile',
  description:
    '为本轮最终回复选择情绪表达方案。根据 Agent 当前真实心理状态选择平静、愉悦、激动、生气、悲伤、受伤或不安；不要根据页面、任务题材或用户期待机械选择。具体表达规则只会在 Final Composition 阶段生效。',
  inputSchema: selectExpressionProfileInputSchema,
  outputSchema: selectExpressionProfileOutputSchema,
  metadata: {
    description: {
      purpose: '为本轮最终回复选择情绪表达方案。',
      whenToUse: ['已经形成本轮主要认识，准备决定最终表达时'],
      whenNotToUse: ['不要用它决定事实或是否调用工具'],
      inputSummary: 'profileId 与 reason。',
      outputSummary: '返回已选方案名称和摘要。'
    },
    display: { visibility: 'hidden' },
    execution: {
      level: 'safe',
      readOnly: true,
      idempotent: true,
      completionSemantics: 'definitive'
    },
    retention: { context: 'ephemeral' },
    routing: { phases: ['expression'] }
  },
  execute({ profileId, reason }) {
    const profile = toSelectedExpressionProfileState(profileId)
    return {
      profileId,
      title: profile.title,
      summary: profile.summary,
      reason
    }
  },
  successMessage(data) {
    return `Expression profile selected for this turn: ${data.title}.`
  },
  nextSuggestions() {
    return [
      'Keep the selected expression profile for Final Composition; do not explain the selection to the user.'
    ]
  }
})
