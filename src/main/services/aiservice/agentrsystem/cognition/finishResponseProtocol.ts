import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { ResponseOrientation } from '@share/cache/AItype/states/turnWorkspace'
import { EXPRESSION_AFFECT_VALUES } from '../../prompt/main_agent/persona/expressionAffectPrompts'

export const FINISH_RESPONSE_TOOL_NAME = 'finish_response'
export const ESTABLISH_COGNITION_TOOL_NAME = 'establish_cognition'

const initialCognitionSchema = z.object({
  understanding: z.string().min(1).max(600).describe('结合用户原意与当前处境形成的本轮初始理解'),
  selfPosition: z.string().min(1).max(240).describe('基于稳定人格，本轮以怎样的身份和关系位置面对用户'),
  personalMeaning: z.string().max(300).nullable().optional().describe('这件事对自己的在意点或意义；没有则为 null'),
  provisionalStance: z.string().max(500).nullable().optional().describe('当前真实但可被证据修订的初步立场'),
  knowledgeGap: z.string().max(400).nullable().optional().describe('确实影响理解或行动的信息缺口；没有则为 null'),
  nextObservationGoal: z.string().max(300).nullable().optional().describe('选择观察时真正想确认什么；否则为 null')
})

const responseOrientationSchema = z.object({
  mode: z
    .enum(['conversation', 'answer', 'opinion', 'result', 'clarification'])
    .describe('回应的语义类型'),
  coreResponse: z.string().min(1).max(1200).describe('最核心、必须传达给用户的回应'),
  expressionAffect: z
    .enum(EXPRESSION_AFFECT_VALUES)
    .describe('完成思考后选择的表达情绪取向；由当前立场和关系位置决定，不要直接照抄 Mood 标签'),
  stance: z.string().max(500).optional().describe('Agent 自己的态度、偏爱、保留或反应'),
  basis: z.array(z.string().min(1).max(300)).max(3).default([]).describe('支持立场的少量关键依据'),
  relationalIntent: z
    .enum(['share_reaction', 'answer_directly', 'challenge', 'support', 'invite_discussion', 'report_result'])
    .optional()
    .describe('这次回应与用户的关系意图'),
  selectedPoints: z
    .array(z.string().min(1).max(500))
    .max(3)
    .default([])
    .describe('真正值得展开的一到三个重点，不要罗列全部理解'),
  uncertainty: z.string().max(500).optional().describe('会影响结论且必须保留的不确定性'),
  depth: z.enum(['brief', 'normal', 'expanded']).describe('用户实际需要的展开程度'),
  experienceIntent: z.object({
    relationshipMeaning: z.string().max(400).optional().describe('本轮是否形成了值得跨轮保留的关系认识'),
    selfNarrative: z.string().max(500).optional().describe('这段经历如何进入对自身的理解；普通事务不必填写'),
    commitmentUpdates: z.array(z.object({
      content: z.string().min(1).max(300),
      status: z.enum(['open', 'fulfilled', 'released'])
    })).max(3).default([]).describe('自己认可并愿意承担的承诺变化，不记录普通执行步骤'),
    concernUpdates: z.array(z.object({
      content: z.string().min(1).max(300),
      status: z.enum(['open', 'fulfilled', 'released'])
    })).max(3).default([]).describe('仍值得跨轮关注的问题变化，不记录临时知识缺口'),
    confidence: z.number().min(0).max(1).default(0.7)
  }).optional().describe('只有本轮真正改变关系、承诺、长期关注或自我理解时填写')
})

export const cognitiveRevisionSchema = z.object({
  understanding: z.string().min(1).max(600).describe('吸收工具结果后对当前问题的最新理解'),
  selfPosition: z.string().min(1).max(240).optional().describe('仅当证据确实改变关系位置时提交；否则继承本轮已有主体位置'),
  personalMeaning: z.string().max(300).nullable().optional().describe('新证据是否改变了这件事对自己的意义；null 表示明确清除'),
  provisionalStance: z.string().max(500).nullable().optional().describe('修订后的暂时立场；null 表示明确清除'),
  knowledgeGap: z.string().max(400).nullable().default(null).describe('仍然影响判断的知识缺口；null 表示已经解决'),
  nextObservationGoal: z.string().max(300).nullable().optional().describe('还要调用工具时，下一次观察要确认什么；null 表示不再观察'),
  evidenceImpact: z
    .enum(['supports', 'refines', 'contradicts', 'insufficient', 'irrelevant'])
    .describe('刚才工具证据对原有理解的影响')
})

export const finishResponseTool = new DynamicStructuredTool({
  name: FINISH_RESPONSE_TOOL_NAME,
  description:
    '结束本轮内部认知循环并提交回应取向。先从稳定人格和与用户的关系中明确自己的位置与真实反应，再选择表达情绪取向和值得说的内容。表达取向是思考结论，不得直接从 Mood 标签机械映射。只有在已吸收必要证据且不再需要调用外部工具时使用；不要提交完整思维链。',
  schema: responseOrientationSchema,
  func: async (input) => JSON.stringify(input)
})

export const establishCognitionTool = new DynamicStructuredTool({
  name: ESTABLISH_COGNITION_TOOL_NAME,
  description:
    '在本轮第一次回应或行动前建立最小主体认知。它可以单独提交，系统会先保存理解、主体位置和初步立场，再由下一次模型决策选择 finish_response 或外部工具；也可以与首次 finish_response 或外部工具在同一次决策中提交。它不属于外部工具参数；不要提交完整思维链。',
  schema: initialCognitionSchema,
  func: async (input) => JSON.stringify(input)
})

export const parseFinishResponseToolCall = (
  toolCall: { name?: string; args?: unknown }
): Omit<ResponseOrientation, 'selfPosition' | 'personalMeaning'> | null => {
  if (toolCall.name !== FINISH_RESPONSE_TOOL_NAME) return null
  const parsed = responseOrientationSchema.safeParse(toolCall.args)
  return parsed.success ? parsed.data : null
}

export type CognitiveRevision = z.infer<typeof cognitiveRevisionSchema>
export type InitialCognition = z.infer<typeof initialCognitionSchema>

export const parseInitialCognitionToolCall = (
  toolCall: { name?: string; args?: unknown }
): InitialCognition | null => {
  if (toolCall.name !== ESTABLISH_COGNITION_TOOL_NAME) return null
  const parsed = initialCognitionSchema.safeParse(toolCall.args)
  return parsed.success ? parsed.data : null
}

export const parseCognitiveRevision = (value: unknown): CognitiveRevision | null => {
  const parsed = cognitiveRevisionSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
