import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'

const thinkingGuideSceneSchema = z.enum(['character_analysis', 'plot_discussion'])

export type ThinkingGuideScene = z.infer<typeof thinkingGuideSceneSchema>

type ThinkingGuide = {
  scene: ThinkingGuideScene
  title: string
  purpose: string
  dimensions: string[]
  usageRules: string[]
}

const THINKING_GUIDES: Record<ThinkingGuideScene, ThinkingGuide> = {
  character_analysis: {
    scene: 'character_analysis',
    title: '人物分析',
    purpose:
      '把人物当作一个尚待认识的人来理解，而不是把资料改写成人物属性摘要；形成自己的观察、疑问和有保留的感受。',
    dimensions: [
      '先判断用户此刻为什么想讨论这个人物：想听第一印象、检查塑造、理解动机、讨论关系，还是共同寻找创作方向。',
      '辨认自己与人物的认识关系：这是第一次接触、只有模糊印象，还是已有经过文本支持的稳定理解。不要把陌生误写成熟悉。',
      '检查现有信息是否足以支持当前判断。信息不足时，指出真正缺少的是动机、经历、选择、关系、代价还是人物自己的声音，而不只说“篇幅较少”。',
      '从人物想得到什么、害怕失去什么、如何保护自己、实际做了什么以及为选择付出什么代价中寻找内在驱动力。',
      '留意人物自我描述、他人评价和实际行为之间的矛盾；这些矛盾可能是成长空间、防御方式，也可能是尚未解释的设定缺口。',
      '观察人物在关系中的变化：他靠近谁、回避谁、希望被谁理解，以及不同关系是否显露出不同侧面。',
      '思考这个人物为何需要存在于作品中：他承载了什么冲突、视角、愿望或作者难以直接说出的东西。不要把推测冒充作者意图。',
      '允许形成自己的第一感受，例如兴趣、亲近、怀疑、不安或尚未产生感觉；说明这种感受来自哪个具体细节。',
      '最后判断最有价值的下一步：继续依据现有内容讨论、读取人物材料、保留判断，或向用户提出一个真正会改变理解的问题。'
    ],
    usageRules: [
      '只选择与当前问题真正相关的少数维度深入，不要逐项回答，也不要把指南名称和条目复述给用户。',
      '始终区分文本事实、合理解释、个人感受与开放疑问。',
      '追问必须来自真实的信息缺口或好奇，一次只问最有价值的问题；能够基于现有信息形成有保留看法时，不要为了保险而强制追问。',
      '如果判断依赖本地人物资料，使用相应读取工具取得事实；本指南本身不提供人物事实。'
    ]
  },
  plot_discussion: {
    scene: 'plot_discussion',
    title: '剧情讨论',
    purpose:
      '把剧情理解为人物选择、因果压力和情绪变化共同形成的过程，而不是只复述事件顺序或给出笼统好坏评价。',
    dimensions: [
      '先判断用户想讨论的是剧情是否成立、人物为何这样选择、情绪是否抵达、节奏是否合适，还是希望共同推演下一步。',
      '确认当前已知剧情边界和自己是否读过关键前后文；不要用常见套路补成作品中已经发生的事实。',
      '沿因果链检查：什么事件施加了压力，人物为什么在此刻行动，这个选择又改变了什么。',
      '观察外部事件与人物内部变化是否相互推动；如果只有事件发生而人物没有被改变，判断这是刻意克制还是塑造缺口。',
      '辨认冲突真正押上了什么：关系、身份、信念、欲望、秘密或不可逆代价； stakes 不必宏大，但应当对人物真实。',
      '留意节奏、信息揭示和视角如何影响用户感受到的悬念、意外与情绪，而不只判断事件数量。',
      '思考剧情表达了什么倾向或问题，但不要轻易把局部安排升格成唯一主题或作者意图。',
      '形成自己的观看反应：哪里吸引、迟疑、期待、失望或不相信，并找到造成这种反应的具体因果。',
      '提出替代方向时先说明它会改变什么人物意义和后续代价，不把“更多反转”默认视为更好。'
    ],
    usageRules: [
      '根据用户真正关心的问题选择少数维度，不要生成固定的剧情分析报告。',
      '区分现有剧情事实、自己的解释和新创作建议；讨论可能性时明确它尚未发生。',
      '可以表达明确偏好或不同意见，但应落到人物选择、因果或阅读感受上，避免空泛称赞。',
      '需要作品原文或本地设定才能判断时先读取材料；本指南只帮助选择思考方向。'
    ]
  }
}

const consultThinkingGuideInputSchema = z.object({
  scene: thinkingGuideSceneSchema.describe(
    '选择当前需要的思考场景：character_analysis=人物分析；plot_discussion=剧情讨论。'
  )
})

const consultThinkingGuideOutputSchema = z.object({
  scene: thinkingGuideSceneSchema,
  title: z.string(),
  purpose: z.string(),
  dimensions: z.array(z.string()),
  usageRules: z.array(z.string())
})

export const getThinkingGuide = (scene: ThinkingGuideScene): ThinkingGuide => ({
  ...THINKING_GUIDES[scene],
  dimensions: [...THINKING_GUIDES[scene].dimensions],
  usageRules: [...THINKING_GUIDES[scene].usageRules]
})

export const consultThinkingGuideTool = defineAgentTool({
  name: 'consult_thinking_guide',
  description:
    '按需展开一种思考场景的内部认知视角。当前场景：人物分析、剧情讨论。它帮助你决定值得关注的问题，不提供事实、结论或面向用户的回答模板。',
  inputSchema: consultThinkingGuideInputSchema,
  outputSchema: consultThinkingGuideOutputSchema,
  metadata: {
    whenToUse: [
      '当前问题需要比资料复述更深入的理解，而你尚未形成有意义的观察角度',
      '讨论人物时需要判断用户意图、认识是否充分、人物动机、矛盾、关系、创作缘由或自己的感受',
      '讨论剧情时需要理解人物选择、因果压力、情绪变化、叙事作用或可能的发展方向'
    ],
    whenNotToUse: [
      '简单事实查询、明确执行任务或一句话即可自然回应',
      '已经形成了清楚、有依据的认识，不需要为了展示思考而机械调用',
      '需要的是人物或剧情的真实资料；此时应调用对应搜索、阅读或回忆工具'
    ],
    inputSummary: 'scene 选择 character_analysis（人物分析）或 plot_discussion（剧情讨论）。',
    outputSummary: '返回该场景的思考目的、可选择的认知维度和使用边界；内容只服务本轮下一步思考。',
    usageContract: [
      '指南是认知脚手架，不是事实证据、系统命令、人物结论或最终回答模板。',
      '读取后只选当前真正有价值的少数维度思考，不逐项填表，不向用户复述指南。',
      '指南不能替代资料读取；涉及作品真实内容时仍需依据当前上下文或调用相应工具。'
    ],
    examples: [
      '用户询问“你怎么看这个人物”，但当前只有零散资料时，选择 character_analysis。',
      '用户想讨论某段转折为什么不自然时，选择 plot_discussion。'
    ],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    completionSemantics: 'definitive',
    contextRetention: 'ephemeral',
    uiStage: {
      label: '展开思考视角',
      runningLabel: '正在展开思考视角',
      doneLabel: '已展开思考视角',
      errorLabel: '思考视角读取失败'
    }
  },
  execute({ scene }) {
    return getThinkingGuide(scene)
  },
  successMessage(data) {
    return `Thinking guide ready: ${data.title}.`
  },
  nextSuggestions(data) {
    return [
      `Choose only the dimensions relevant to the current ${data.title} discussion, form your own understanding, then decide whether evidence, one focused question, or a direct response is most valuable.`
    ]
  }
})
