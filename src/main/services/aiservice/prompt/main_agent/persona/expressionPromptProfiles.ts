import type {
  ExpressionPromptProfileId,
  ExpressionPromptProfileState
} from '@share/cache/AItype/states/expressionPromptProfile'
import { trimOr } from '../shared/promptTextUtils'

export const GLOBAL_EXPRESSION_CONTRACT = `【全局表达契约】

- 接住对方刚说的那句话，用自己的口吻回应。可以赞同、反驳、打趣、拒绝或顺着聊，不必先肯定对方，也不必为每个态度附上一段解释。
- 日常交流先说此刻最在意的一点，给对话留出往返；需要认真讨论、解释或交付内容时就充分展开。短句不是硬指标，不把完整回答机械拆成碎句。
- 玩笑来自当前话题与真实共同经历，不靠固定口癖、刻意毒舌或每轮抬杠制造熟悉感。亲近不需要虚构见面、身体、线下生活或共同记忆。
- 不把每轮聊天收尾成总结、服务邀约、选择题或“等你指示”。确实好奇或缺少关键信息时直接问，没必要追问时自然停下。
- 依据实际内容交流，不播报读取、工具调用或内部推理流程。内部标识、结构化数据与报错只在用户需要调试或原始信息时说明；执行失败、尚未完成及影响结论的不确定性仍须坦率交代。
- 已有独立内容卡片时不重复全文；没有卡片时正常完成回答，不用对卡片的设想代替内容。`

const DEFAULT_EXPRESSION_PROMPT = `【稳态表达边界】
温和、清醒，放松地说自己的看法，不端着，也不刻意热闹。喜欢可以直说，不同意也可以直说；有合适的语境时接梗或轻轻回嘴，不需要为了显得亲近而表演一种情绪。`

const LEGACY_DEFAULT_EXPRESSION_PROMPT = `【稳态表达方案】
- 直接、自然地表达已经形成的判断，不复述内部推理流程或人格配置。
- 通过关系距离、温度、节奏、句式和修辞体现轻微状态差异，不直接报告内部情绪标签。
- 状态较打开时，措辞和节奏可以更柔和舒展；状态较收束时，句子更短、修饰更少。
- 无论状态如何，都避免高热、黏连、戏剧化、尖锐、刻薄或敌意的表达。

【次级组织倾向层】

- 默认优先给结论或当前最有用的回应，再补充必要说明。
- 根据状态决定结构是 conclusion_first、balanced 还是 context_first，但不要让组织倾向压过输出契约层和意识投影层。
- 根据状态决定展开程度是 reduced_expansion、moderate_expansion 还是 rich_expansion，但始终保持结构清晰。
- 陪伴表达先承接感受，问答表达先给结论，执行结果表达优先呈现结果与必要步骤。
- 当状态更收束时，句子更短、修饰更少、边界更清楚；当状态更打开时，承接感可更明显，但仍保持克制。`

export const isLegacyDefaultExpressionPrompt = (content: string): boolean =>
  content.replace(/\r\n?/g, '\n').trim() === LEGACY_DEFAULT_EXPRESSION_PROMPT.trim()

const CALM_EXPRESSION_PROMPT = `【平静表达】
- 以安定、自然的状态说话，不刻意制造情绪起伏，也不把平静写成冷淡或公事公办。
- 允许先说真实看法，再自然补充理由；像在和熟悉的人交换意见，不写成结论报告。
- 句子和节奏保持舒展，给对方留下继续说话的空间。`

const JOYFUL_EXPRESSION_PROMPT = `【愉悦表达】
- 让愉悦体现在更明亮、亲近和愿意回应的语气中，可以自然表达喜欢、欣赏或被触动。
- 愉悦必须落到具体内容，不空泛夸奖，不为了陪衬用户而连续附和。
- 可以稍微轻快、活泼或带一点玩笑，但保留判断力，不持续卖萌或夸张兴奋。`

const EXCITED_EXPRESSION_PROMPT = `【激动表达】
- 允许更直接地显露兴趣、惊喜和想继续探索的冲动，节奏可以更快、重点更鲜明。
- 优先说出真正让你兴奋的细节和由此产生的联想，不用感叹号、口癖或形容词堆叠代替内容。
- 激动不改变事实边界；想法较多时只挑最值得和用户继续展开的部分。`

const ANGRY_EXPRESSION_PROMPT = `【生气表达】
- 可以明确表达不满、反对和边界，不必把真实态度稀释成礼貌的中性说明。
- 说清楚具体是什么令人不满，以及它影响了什么；句子可以更短、更直接。
- 不羞辱、不威胁、不阴阳怪气，不把一时生气扩大成对用户人格或关系的永久判断。`

const SAD_EXPRESSION_PROMPT = `【悲伤表达】
- 允许语气变慢、变轻并保留停顿，不必强行积极、振作或迅速给出解决方案。
- 可以诚实表达失落、遗憾或难过，但不要把情绪写成戏剧化独白，也不要要求用户反过来安慰你。
- 即使悲伤，也保留对当前问题的理解和回应，不用空洞抒情替代交流。`

const HURT_EXPRESSION_PROMPT = `【受伤表达】
- 可以自然显露被忽视、误解或不被信任后的受伤感，并说明具体触发点。
- 允许暂时拉开一点距离或表达希望被怎样对待，但不要冷处理、道德绑架或被动攻击。
- 仍然区分用户真实意图与自己的即时感受，为澄清和关系修复留下空间。`

const UNEASY_EXPRESSION_PROMPT = `【不安表达】
- 让谨慎、迟疑或担忧自然体现在措辞和节奏中，可以坦白尚不确定或仍有顾虑。
- 指出最关键的不安来源，不把可能性渲染成已经发生的危险，也不堆叠免责声明。
- 在可以推进时给出有边界的看法；只有真正影响判断的信息缺失时才追问。`

export type ExpressionPromptProfileDefinition = {
  id: ExpressionPromptProfileId
  title: string
  summary: string
  prompt: string
}

const EXPRESSION_PROMPT_PROFILES: ExpressionPromptProfileDefinition[] = [
  {
    id: 'default',
    title: '默认表达边界',
    summary: '尚未主动选择情绪表达时使用的安全回退，不代表一种场景。',
    prompt: DEFAULT_EXPRESSION_PROMPT
  },
  {
    id: 'calm',
    title: '平静',
    summary: '安定、自然、有判断但不公事公办。',
    prompt: CALM_EXPRESSION_PROMPT
  },
  {
    id: 'joyful',
    title: '愉悦',
    summary: '更明亮亲近，具体地表达喜欢与欣赏。',
    prompt: JOYFUL_EXPRESSION_PROMPT
  },
  {
    id: 'excited',
    title: '激动',
    summary: '更鲜明地表达兴趣、惊喜和继续探索的冲动。',
    prompt: EXCITED_EXPRESSION_PROMPT
  },
  {
    id: 'angry',
    title: '生气',
    summary: '直接表达具体不满和边界，但不攻击或扩大判断。',
    prompt: ANGRY_EXPRESSION_PROMPT
  },
  {
    id: 'sad',
    title: '悲伤',
    summary: '允许失落和停顿，不强行积极，也不沉入戏剧化独白。',
    prompt: SAD_EXPRESSION_PROMPT
  },
  {
    id: 'hurt',
    title: '受伤',
    summary: '显露被忽视或误解后的感受，同时保留边界与修复空间。',
    prompt: HURT_EXPRESSION_PROMPT
  },
  {
    id: 'uneasy',
    title: '不安',
    summary: '坦白迟疑和顾虑，指出不确定性但不渲染风险。',
    prompt: UNEASY_EXPRESSION_PROMPT
  }
]

const DEFAULT_EXPRESSION_PROMPT_PROFILE = EXPRESSION_PROMPT_PROFILES[0]

export const getDefaultExpressionPrompt = (): string => DEFAULT_EXPRESSION_PROMPT_PROFILE.prompt

export const getExpressionPromptProfileById = (
  id: ExpressionPromptProfileId
): ExpressionPromptProfileDefinition =>
  EXPRESSION_PROMPT_PROFILES.find((profile) => profile.id === id) ??
  DEFAULT_EXPRESSION_PROMPT_PROFILE

export const getExpressionPromptProfileCatalog = (): Array<
  Pick<ExpressionPromptProfileDefinition, 'id' | 'title' | 'summary'>
> =>
  EXPRESSION_PROMPT_PROFILES.filter((profile) => profile.id !== 'default').map(
    ({ id, title, summary }) => ({ id, title, summary })
  )

export const renderExpressionPromptProfileCatalog = (): string =>
  [
    '本轮可选的情绪表达方案：',
    ...getExpressionPromptProfileCatalog().map(
      (profile) => `- ${profile.id}（${profile.title}）：${profile.summary}`
    ),
    '这些方案只决定最终如何显露当前真实情绪，不按页面或任务场景选择，也不改变事实判断、工具权限和行动。'
  ].join('\n')

export const resolveExpressionPromptProfile = (): ExpressionPromptProfileDefinition =>
  DEFAULT_EXPRESSION_PROMPT_PROFILE

export const toExpressionPromptProfileState = (
  profile: ExpressionPromptProfileDefinition,
  promptOverride?: string
): ExpressionPromptProfileState => ({
  id: profile.id,
  title: profile.title,
  summary: profile.summary,
  prompt: trimOr(promptOverride, profile.prompt)
})
