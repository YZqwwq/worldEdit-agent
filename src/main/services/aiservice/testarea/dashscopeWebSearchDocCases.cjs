#!/usr/bin/env node

/*
 * Run web-search examples close to the Aliyun Model Studio documentation.
 *
 * It compares:
 * 1. OpenAI-compatible Chat Completions, Node.js style top-level enable_search.
 * 2. OpenAI-compatible Chat Completions with search_strategy=max.
 * 3. OpenAI-compatible Responses API with web_search tools.
 * 4. DashScope native Generation API with enable_source=true.
 *
 * Config:
 *   MODEL_API_KEY or DASHSCOPE_API_KEY
 *   MODEL_BASE_URL defaults to https://dashscope.aliyuncs.com/compatible-mode/v1
 *
 * Example:
 *   node src/main/services/aiservice/ai-utils/testarea/dashscopeWebSearchDocCases.cjs --out .tmp-dashscope-doc-cases.json
 */

const fs = require('node:fs')
const path = require('node:path')
const OpenAIModule = require('openai')

const OpenAI = OpenAIModule.default || OpenAIModule
const DEFAULT_COMPAT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DASHSCOPE_GENERATION_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'

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

const safeStringify = (value) => JSON.stringify(value, null, 2)

const summarizeOpenAIChat = (completion) => ({
  topLevelKeys: Object.keys(completion || {}),
  choiceMessageKeys: Object.keys(completion?.choices?.[0]?.message || {}),
  contentPreview: String(completion?.choices?.[0]?.message?.content || '').slice(0, 500),
  hasTopLevelSearchInfo: Boolean(completion?.search_info),
  hasUsageSearchInfo: Boolean(completion?.usage?.search_info),
  usage: safeJsonClone(completion?.usage)
})

const summarizeResponses = (response) => ({
  topLevelKeys: Object.keys(response || {}),
  outputTypes: Array.isArray(response?.output)
    ? response.output.map((item) => item?.type).filter(Boolean)
    : [],
  outputTextPreview: String(response?.output_text || '').slice(0, 500),
  usage: safeJsonClone(response?.usage)
})

const summarizeDashScopeNative = (response) => {
  const searchResults = response?.output?.search_info?.search_results
  const content = response?.output?.choices?.[0]?.message?.content
  return {
    topLevelKeys: Object.keys(response || {}),
    outputKeys: Object.keys(response?.output || {}),
    hasSearchInfo: Boolean(response?.output?.search_info),
    searchResultCount: Array.isArray(searchResults) ? searchResults.length : 0,
    firstSearchResult: Array.isArray(searchResults) ? searchResults[0] : null,
    contentPreview: String(content || '').slice(0, 500),
    usage: safeJsonClone(response?.usage)
  }
}

const runCase = async (name, fn) => {
  const startedAt = Date.now()
  try {
    const result = await fn()
    return {
      name,
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result
    }
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: {
        name: error?.name,
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const apiKey = args['api-key'] || process.env.DASHSCOPE_API_KEY || process.env.MODEL_API_KEY
  const baseURL = args['base-url'] || process.env.MODEL_BASE_URL || DEFAULT_COMPAT_BASE_URL
  const chatModel = args['chat-model'] || 'qwen-plus'
  const responsesModel = args['responses-model'] || process.env.MODEL_NAME || 'qwen3.7-max'
  const query = args.query || '杭州明天天气如何'
  const researchQuery = args['research-query'] || 'Qwen 2025年9月份发布了哪些模型'

  if (!apiKey) {
    throw new Error('Missing API key. Set DASHSCOPE_API_KEY or MODEL_API_KEY.')
  }

  const openai = new OpenAI({ apiKey, baseURL })

  const cases = []

  cases.push(
    await runCase('openai_chat_basic_node_style', async () => {
      const completion = await openai.chat.completions.create({
        model: chatModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: query }
        ],
        enable_search: true
      })
      return {
        requestShape: {
          protocol: 'openai_compatible_chat_completions',
          model: chatModel,
          enable_search: true
        },
        summary: summarizeOpenAIChat(completion),
        raw: safeJsonClone(completion)
      }
    })
  )

  cases.push(
    await runCase('openai_chat_search_strategy_max', async () => {
      const completion = await openai.chat.completions.create({
        model: chatModel,
        messages: [{ role: 'user', content: researchQuery }],
        enable_search: true,
        search_options: {
          search_strategy: 'max'
        }
      })
      return {
        requestShape: {
          protocol: 'openai_compatible_chat_completions',
          model: chatModel,
          enable_search: true,
          search_options: { search_strategy: 'max' }
        },
        summary: summarizeOpenAIChat(completion),
        raw: safeJsonClone(completion)
      }
    })
  )

  cases.push(
    await runCase('openai_responses_web_search_tools', async () => {
      const response = await openai.responses.create({
        model: responsesModel,
        input: query,
        tools: [
          { type: 'web_search' },
          { type: 'web_extractor' },
          { type: 'code_interpreter' }
        ],
        extra_body: {
          enable_thinking: true
        }
      })
      return {
        requestShape: {
          protocol: 'openai_compatible_responses',
          model: responsesModel,
          tools: ['web_search', 'web_extractor', 'code_interpreter']
        },
        summary: summarizeResponses(response),
        raw: safeJsonClone(response)
      }
    })
  )

  cases.push(
    await runCase('dashscope_native_enable_source', async () => {
      const response = await fetch(DASHSCOPE_GENERATION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: chatModel,
          input: {
            messages: [{ role: 'user', content: researchQuery }]
          },
          parameters: {
            enable_search: true,
            search_options: {
              search_strategy: 'max',
              forced_search: true,
              enable_source: true
            },
            result_format: 'message'
          }
        })
      })
      const json = await response.json()
      if (!response.ok) {
        const error = new Error(`DashScope native request failed: ${response.status}`)
        error.status = response.status
        error.response = json
        throw error
      }
      return {
        requestShape: {
          protocol: 'dashscope_native_generation',
          model: chatModel,
          enable_search: true,
          search_options: { search_strategy: 'max', forced_search: true, enable_source: true }
        },
        summary: summarizeDashScopeNative(json),
        raw: safeJsonClone(json)
      }
    })
  )

  const report = {
    timestamp: new Date().toISOString(),
    docs: {
      url: 'https://help.aliyun.com/zh/model-studio/web-search',
      note:
        'OpenAI-compatible Chat Completions supports search but not structured search sources; DashScope native supports search_info.search_results.'
    },
    config: {
      baseURL,
      chatModel,
      responsesModel,
      query,
      researchQuery
    },
    cases
  }

  for (const item of cases) {
    console.log(`\n[${item.ok ? 'ok' : 'failed'}] ${item.name} (${item.durationMs}ms)`)
    console.log(safeStringify(item.ok ? item.summary : item.error))
  }

  if (args.out) {
    const outPath = path.resolve(args.out)
    fs.writeFileSync(outPath, `${safeStringify(report)}\n`, 'utf8')
    console.log(`\n[dashscope-doc-cases] wrote full report: ${outPath}`)
  }
}

main().catch((error) => {
  console.error('[dashscope-doc-cases] failed')
  console.error(error)
  process.exitCode = 1
})
