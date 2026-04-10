import * as z from 'zod'
import { browserObservationService } from '../../../browser-observation/browserObservationService'
import { defineAgentTool } from '../../core/agentTool'

const openWebPageTextInputSchema = z.object({
  url: z.string().trim().min(1),
  timeoutMs: z.number().int().min(3000).max(60000).optional()
})

const openWebPageTextOutputSchema = z.object({
  requestedUrl: z.string(),
  finalUrl: z.string(),
  title: z.string(),
  text: z.string(),
  capturedAt: z.string()
})

export const openWebPageTextTool = defineAgentTool({
  name: 'open_web_page_text',
  description: 'Open a web page and return a readable text snapshot of its current content.',
  inputSchema: openWebPageTextInputSchema,
  outputSchema: openWebPageTextOutputSchema,
  metadata: {
    whenToUse: [
      '需要读取某个网页当前可见正文内容',
      '用户已经给出具体 URL，希望主 agent 基于网页内容回答',
      '需要先观测页面文本，再决定是否继续联网搜索或执行其他操作'
    ],
    whenNotToUse: [
      '还没有明确 URL',
      '只需要当前时间或本地应用状态，不需要访问外部网页',
      '需要修改网页内容或执行浏览器交互，而不是只读观察'
    ],
    inputSummary: '提供目标网页 URL，可选提供 timeoutMs。',
    outputSummary: '返回 requestedUrl、finalUrl、title、text、capturedAt。',
    examples: [
      '当用户贴来一个页面链接并要求总结内容时，先调用 open_web_page_text。',
      '在判断某个网页是否包含目标信息前，先读取页面标题和正文文本。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: false,
    completionSemantics: 'definitive'
  },
  async execute(input) {
    return browserObservationService.observePageText(input)
  },
  successMessage(data) {
    return data.title
      ? `Loaded web page "${data.title}" for observation.`
      : `Loaded web page ${data.finalUrl} for observation.`
  },
  nextSuggestions(data) {
    return data.text
      ? [
          'Use the returned page text as the primary observation source before making claims.',
          'If the page content still looks incomplete, consider refining the target URL or increasing timeout.'
        ]
      : [
          'The page loaded but produced little readable text; explain that limitation before guessing.',
          'If needed, try another URL that contains the primary content instead of a shell page.'
        ]
  },
  failureSuggestions: [
    'Confirm the URL is valid and reachable.',
    'If the page is highly dynamic, retry with a slightly longer timeout instead of guessing its content.'
  ]
})
