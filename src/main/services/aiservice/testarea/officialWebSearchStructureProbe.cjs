#!/usr/bin/env node

/*
 * Probe the raw response structure behind official_web_search.
 *
 * Examples:
 *   node src/main/services/aiservice/ai-utils/testarea/officialWebSearchStructureProbe.cjs --query "Bun JavaScript runtime rewrite in Rust"
 *   node src/main/services/aiservice/ai-utils/testarea/officialWebSearchStructureProbe.cjs --db "C:\\Users\\<you>\\AppData\\Roaming\\worldedit-agent\\database.sqlite"
 *   node src/main/services/aiservice/ai-utils/testarea/officialWebSearchStructureProbe.cjs --out .tmp-official-web-search.json
 *
 * Config priority:
 *   CLI args > env MODEL_API_KEY/MODEL_BASE_URL/MODEL_NAME > optional --db modelconfig row.
 */

const fs = require('node:fs')
const path = require('node:path')
const OpenAIModule = require('openai')

const OpenAI = OpenAIModule.default || OpenAIModule
const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

const parseArgs = (argv) => {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

const safeJsonClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return {
      unserializable: true,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const safeStringify = (value) =>
  JSON.stringify(
    value,
    (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    2
  )

const readConfigFromDb = (dbPath) => {
  if (!dbPath) return {}
  const resolved = path.resolve(dbPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Database file does not exist: ${resolved}`)
  }

  const Database = require('better-sqlite3')
  const db = new Database(resolved, { readonly: true })
  try {
    const row =
      db
        .prepare(
          'select modelkey, modeltype, model, baseurl from modelconfig order by id asc limit 1'
        )
        .get() || {}
    return {
      apiKey: row.modelkey || '',
      vendor: row.modeltype || '',
      model: row.model || '',
      baseURL: row.baseurl || ''
    }
  } finally {
    db.close()
  }
}

const toSingleLine = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\*+/g, '')
    .trim()

const truncateText = (text, maxLength) =>
  text.length <= maxLength
    ? text
    : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`

const extractSources = (completion) => {
  const candidateResults =
    completion?.search_info?.search_results ??
    completion?.output?.search_info?.search_results ??
    completion?.usage?.search_info?.search_results ??
    completion?.response_metadata?.search_info?.search_results ??
    []

  if (!Array.isArray(candidateResults)) return []

  return candidateResults
    .map((item) => ({
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

const extractResultCount = (completion, sources) => {
  const directCount = completion?.usage?.plugins?.search?.count
  if (Number.isFinite(directCount)) return Math.max(0, Number(directCount))
  return sources.length
}

const buildSearchSummary = ({ rawAnswer, hasStructuredSources, resultCount }) => {
  const normalizedAnswer = toSingleLine(rawAnswer)
  const conciseConclusion = normalizedAnswer
    ? truncateText(normalizedAnswer, 180)
    : 'Search was forced, but no usable answer was returned.'
  const sourceStatus = hasStructuredSources
    ? `Source status: ${resultCount} structured source(s) returned.`
    : 'Source status: no structured sources returned.'

  return `${conciseConclusion}\n${sourceStatus}`
}

const inspectCandidatePaths = (completion) => ({
  topLevelKeys: Object.keys(completion || {}),
  search_info: safeJsonClone(completion?.search_info),
  output_search_info: safeJsonClone(completion?.output?.search_info),
  usage_search_info: safeJsonClone(completion?.usage?.search_info),
  response_metadata_search_info: safeJsonClone(completion?.response_metadata?.search_info),
  usage_plugins_search: safeJsonClone(completion?.usage?.plugins?.search),
  choices0_message_keys: Object.keys(completion?.choices?.[0]?.message || {}),
  choices0_message: safeJsonClone(completion?.choices?.[0]?.message),
  usage: safeJsonClone(completion?.usage)
})

async function main() {
  const args = parseArgs(process.argv)
  const dbConfig = readConfigFromDb(args.db)
  const apiKey = args['api-key'] || process.env.MODEL_API_KEY || dbConfig.apiKey || ''
  const baseURL =
    args['base-url'] ||
    process.env.MODEL_BASE_URL ||
    dbConfig.baseURL ||
    DEFAULT_DASHSCOPE_BASE_URL
  const model = args.model || process.env.MODEL_NAME || dbConfig.model || 'qwen-plus'
  const query = args.query || 'Bun JavaScript runtime rewrite in Rust'
  const reason = args.reason || 'Probe official web search raw response structure.'

  if (!apiKey) {
    throw new Error(
      'Missing API key. Pass --api-key, set MODEL_API_KEY, or pass --db pointing to the app database.'
    )
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  })

  const request = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a web search probe. Return a concise answer and preserve source metadata if available.'
      },
      {
        role: 'user',
        content: reason ? `Search query: ${query}\nProbe reason: ${reason}` : query
      }
    ],
    temperature: Number(args.temperature ?? 0.2),
    enable_search: true,
    search_options: {
      forced_search: true,
      enable_source: true,
      search_strategy: args.strategy || 'turbo'
    }
  }

  console.log('[official-web-search-probe] request')
  console.log(
    safeStringify({
      model,
      baseURL,
      query,
      reason,
      search_options: request.search_options
    })
  )

  const completion = await client.chat.completions.create(request)
  const rawAnswer = completion?.choices?.[0]?.message?.content?.trim() || ''
  const sources = extractSources(completion)
  const resultCount = extractResultCount(completion, sources)
  const usedSearch = true
  const hasStructuredSources = resultCount > 0 || sources.length > 0
  const summary = buildSearchSummary({
    rawAnswer,
    hasStructuredSources,
    resultCount
  })

  const toolExecuteReturn = {
    query,
    searchMode: 'forced',
    summary,
    rawAnswer,
    usedSearch,
    hasStructuredSources,
    resultCount,
    sources
  }

  const report = {
    timestamp: new Date().toISOString(),
    request: {
      model,
      baseURL,
      query,
      reason,
      search_options: request.search_options
    },
    candidatePaths: inspectCandidatePaths(completion),
    toolExecuteReturn,
    rawCompletion: safeJsonClone(completion)
  }

  console.log('\n[official-web-search-probe] parsed tool-like return')
  console.log(safeStringify(toolExecuteReturn))

  console.log('\n[official-web-search-probe] candidate paths')
  console.log(safeStringify(report.candidatePaths))

  if (args.out) {
    const outPath = path.resolve(args.out)
    fs.writeFileSync(outPath, `${safeStringify(report)}\n`, 'utf8')
    console.log(`\n[official-web-search-probe] wrote full report: ${outPath}`)
  } else if (!args['no-raw']) {
    console.log('\n[official-web-search-probe] raw completion')
    console.log(safeStringify(report.rawCompletion))
  }
}

main().catch((error) => {
  console.error('[official-web-search-probe] failed')
  console.error(error)
  process.exitCode = 1
})
