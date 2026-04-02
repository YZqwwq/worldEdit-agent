import * as z from 'zod'

export const taskExecutorKindSchema = z.enum([
  'general_task_worker',
  'code_worker',
  'doc_worker',
  'character_editor',
  'tool_builder',
  'architecture_analyst',
  'general_research'
])

export const continueActiveChildAgentOutputSchema = z.object({
  accepted: z.literal(true),
  taskId: z.number().int().positive(),
  executionId: z.number().int().positive(),
  executorKind: taskExecutorKindSchema,
  status: z.literal('running'),
  summary: z.string().trim().min(1).max(500),
  nextAction: z.literal('await_subagent_result')
})

