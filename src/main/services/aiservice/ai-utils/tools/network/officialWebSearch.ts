import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import OpenAI from 'openai'
import * as z from 'zod'
import { modelConfigService } from '../../../../modelconfig/modelConfigService'
import { defineAgentTool } from '../../core/agentTool'

const officialWebSearchInputSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  reason: z.string().trim().max(200).optional()
})

const officialWebSearchOutputSchema = z.object({
  query: z.string(),
  searchMode: z.literal('forced'),
  summary: z.string(),
  usedSearch: z.boolean(),
  hasStructuredSources: z.boolean(),
  resultCount: z.number().int().nonnegative(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  )
})

type DashScopeSearchResult = {
  title?: string
  link?: string
  url?: string
}

const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const WEB_SEARCH_DEBUG_LOG_PATH = join(
  process.cwd(),
  'src/main/services/log/logs/official-web-search-debug.jsonl'
)

const safeSerialize = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return {
      unserializable: true,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const appendDebugLog = (record: Record<string, unknown>): void => {
  try {
    appendFileSync(WEB_SEARCH_DEBUG_LOG_PATH, `${JSON.stringify(record)}\n`)
  } catch {
    // ignore debug log failure
  }
}

const toSingleLine = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\*+/g, '')
    .trim()

const truncateText = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`

const buildSearchSummary = (input: {
  rawAnswer: string
  hasStructuredSources: boolean
  resultCount: number
}): string => {
  const normalizedAnswer = toSingleLine(input.rawAnswer)
  const conciseConclusion = normalizedAnswer
    ? truncateText(normalizedAnswer, 180)
    : '已执行强制联网搜索，但未返回可用结论。'

  const sourceStatus = input.hasStructuredSources
    ? `来源状态：已返回 ${input.resultCount} 条结构化来源。`
    : '来源状态：未返回结构化来源。'

  return `${conciseConclusion}\n${sourceStatus}`
}

const extractSources = (completion: unknown): Array<{ title: string; url: string }> => {
  const candidateResults =
    (completion as any)?.search_info?.search_results ??
    (completion as any)?.output?.search_info?.search_results ??
    (completion as any)?.usage?.search_info?.search_results ??
    (completion as any)?.response_metadata?.search_info?.search_results ??
    []

  if (!Array.isArray(candidateResults)) {
    return []
  }

  return candidateResults
    .map((item: DashScopeSearchResult) => ({
      title: typeof item?.title === 'string' ? item.title.trim() : '',
      url:
        typeof item?.link === 'string'
          ? item.link.trim()
          : typeof item?.url === 'string'
            ? item.url.trim()
            : ''
    }))
    .filter((item) => item.title || item.url)
}

const extractResultCount = (completion: unknown, sources: Array<{ title: string; url: string }>): number => {
  const directCount = (completion as any)?.usage?.plugins?.search?.count
  if (Number.isFinite(directCount)) {
    return Math.max(0, Number(directCount))
  }
  return sources.length
}

const resolveSearchModelConfig = async (): Promise<{
  apiKey: string
  baseURL: string
  model: string
}> => {
  const config = await modelConfigService.getModelConfig()
  const apiKey = config.modelKey.trim()
  const baseURL = (config.baseURL || DEFAULT_DASHSCOPE_BASE_URL).trim()
  const model = config.model.trim()

  if (!apiKey) {
    throw new Error('当前未配置 DashScope API Key，无法执行官方联网搜索。')
  }

  if (config.vendor !== 'openai') {
    throw new Error('当前主模型并非 OpenAI 兼容配置，无法执行 DashScope 官方联网搜索。')
  }

  if (!baseURL.toLowerCase().includes('dashscope.aliyuncs.com')) {
    throw new Error('当前主模型 baseURL 不是 DashScope 兼容地址，无法执行官方联网搜索。')
  }

  if (!model) {
    throw new Error('当前未配置可用于联网搜索的模型。')
  }

  return {
    apiKey,
    baseURL,
    model
  }
}

export const officialWebSearchTool = defineAgentTool({
  name: 'official_web_search',
  description: 'Use DashScope official web search to retrieve up-to-date public information.',
  inputSchema: officialWebSearchInputSchema,
  outputSchema: officialWebSearchOutputSchema,
  metadata: {
    whenToUse: [
      '用户询问新闻、时事、天气、价格、近期发布、网页资料或其他时效性强的信息',
      '需要最新公开资料支撑回答，而不是依赖稳定常识',
      '用户明确要求“查一下最新资料”或“联网搜一下”',
      '回答质量明显依赖外部实时公开信息，而本地工具和现有上下文都无法给出可靠答案'
    ],
    whenNotToUse: [
      '问题只涉及本地数据库、世界观状态、任务状态或配置',
      '问题是稳定常识，不依赖实时信息',
      '只是普通闲聊、情绪陪伴或不需要外部公开资料的讨论',
      '用户只是想听观点、建议、分析或陪聊，而不是要最新事实',
      '问题主要依赖你的判断、表达或推理，不依赖联网结果',
      '用户已经提供了足够的页面文本、资料摘录或明确来源，不需要再次联网搜索',
      '问题可以先澄清范围、时间或对象，再决定是否联网；此时不要直接搜索'
    ],
    inputSummary: '输入 query，必要时可补一条简短 reason 说明搜索目的。',
    outputSummary: '返回搜索结论 summary、是否实际使用搜索、命中结果数 sources 和原始回答。',
    usageContract: [
      '这是“最新公开信息查询工具”，不是默认回答工具；只有在答案明显依赖实时或近期外部信息时才调用。',
      '如果问题更像观点讨论、情绪陪伴、创作共想、一般解释或日常聊天，默认不要调用本工具。',
      '如果只是缺一个更清楚的问题范围，应先在脑中收束 query，必要时再追问；不要把模糊原话直接拿去搜。',
      '优先把用户真正想查的问题整理成清晰搜索 query，不要把无关上下文都塞进 query。',
      '同一轮里避免重复搜索相近问题；除非第一次结果明显不足，否则不要连续多次联网。',
      '拿到结果后，应基于工具返回的 summary 和 sources 回答，而不是再次臆造“我查到”的内容。',
      '如果工具返回 ok=false，应向用户说明无法联网获取最新资料，而不是假装已经查过。',
      '如果没有明确的实时性需求，就不要为了“显得更严谨”而联网。'
    ],
    examples: [
      '用户问“今天杭州天气怎样”，调用 official_web_search。',
      '用户问“最近 AI 领域有哪些重要新闻”，调用 official_web_search。',
      '用户问“OpenAI 最新模型发布了吗”，调用 official_web_search。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: false,
    completionSemantics: 'definitive',
    contextRetention: 'evidence'
  },
  async execute(input) {
    const { apiKey, baseURL, model } = await resolveSearchModelConfig()
    const client = new OpenAI({
      apiKey,
      baseURL
    })

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是联网搜索工具。请基于联网结果给出简短、可靠、可引用的结论。优先保留关键信息，不要闲聊。'
        },
        {
          role: 'user',
          content: input.reason
            ? `搜索问题：${input.query}\n搜索目的：${input.reason}`
            : input.query
        }
      ],
      temperature: 0.2,
      enable_search: true,
      search_options: {
        forced_search: true,
        enable_source: true,
        search_strategy: 'turbo'
      }
    } as any)

    const rawAnswer = completion.choices?.[0]?.message?.content?.trim() || ''
    const sources = extractSources(completion)
    const resultCount = extractResultCount(completion, sources)
    const usedSearch = true
    const hasStructuredSources = resultCount > 0 || sources.length > 0
    const summary = buildSearchSummary({
      rawAnswer,
      hasStructuredSources,
      resultCount
    })

    appendDebugLog({
      timestamp: new Date().toISOString(),
      request: {
        model,
        query: input.query,
        reason: input.reason ?? null,
        enable_search: true,
        search_options: {
          forced_search: true,
          enable_source: true,
          search_strategy: 'turbo'
        }
      },
      parsed: {
        usedSearch,
        searchMode: 'forced',
        hasStructuredSources,
        resultCount,
        sourceCount: sources.length,
        sources,
        rawAnswerPreview: rawAnswer.slice(0, 500),
        candidatePaths: {
          search_info: safeSerialize((completion as any)?.search_info),
          output_search_info: safeSerialize((completion as any)?.output?.search_info),
          usage_search_info: safeSerialize((completion as any)?.usage?.search_info),
          response_metadata_search_info: safeSerialize(
            (completion as any)?.response_metadata?.search_info
          ),
          usage_plugins_search: safeSerialize((completion as any)?.usage?.plugins?.search),
          choices0_message: safeSerialize((completion as any)?.choices?.[0]?.message),
          usage: safeSerialize((completion as any)?.usage)
        }
      },
      rawCompletion: safeSerialize(completion)
    })

    return {
      query: input.query,
      searchMode: 'forced' as const,
      summary,
      usedSearch,
      hasStructuredSources,
      resultCount,
      sources
    }
  },
  successMessage(data) {
    if (data.hasStructuredSources) {
      return `官方联网搜索已完成，返回 ${data.resultCount} 条结构化来源。`
    }
    return '官方联网搜索已完成，但未返回结构化来源。'
  },
  buildReceipt(data) {
    return {
      kind: 'official_web_search_completed',
      summary: `已完成官方联网搜索：${data.query}`,
      payload: {
        usedSearch: data.usedSearch,
        searchMode: data.searchMode,
        hasStructuredSources: data.hasStructuredSources,
        resultCount: data.resultCount,
        sourceCount: data.sources.length
      }
    }
  },
  nextSuggestions(data) {
    if (data.sources.length > 0) {
      return [
        '优先依据 returned summary 和 sources 作答。',
        '如果用户追问来源，可引用 sources 中的标题与链接。'
      ]
    }
    return [
      '工具已执行强制联网搜索，但没有返回结构化来源；回答时不要声称掌握了可引用链接。',
      '如果结果看起来不够稳定，可换更具体的 query 再搜一次。'
    ]
  },
  failureSuggestions: [
    '确认当前模型配置使用的是 DashScope OpenAI 兼容地址与有效 API Key。',
    '如果问题不依赖最新资料，请改用常规回答而不是继续强行联网。'
  ]
})
