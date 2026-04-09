import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  buildQwenInputContent,
  formatFileLine,
  parseMainAgentContentForPersistence
} from './mainAgentMessageContentService'
import {
  createChatModelRuntime,
  getConfiguredModelOptions
} from '../agentrsystem/modelwithtool/model'
import { contentToText } from '../messageoutput/transformRespones'
import {
  type MainAgentFileContentPart,
  type MainAgentMessageContentPart
} from '@share/cache/AItype/states/mainAgentMessageContent'
import { resolveModelProviderProfile } from '../model-adapters/modelProviderAdapter'

const SMALL_QWEN_VISION_MODEL = 'qwen3-vl-flash'

const sanitizeCaption = (input: string): string => {
  return input
    .replace(/[\r\n]+/g, ' ')
    .replace(/[。！？!?,，；;：:"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

const shouldUseQwenVisionParser = async (): Promise<boolean> => {
  const options = await getConfiguredModelOptions()
  return resolveModelProviderProfile(options) === 'dashscope_qwen'
}

const parseImageCaptionWithSmallModel = async (
  file: MainAgentFileContentPart
): Promise<string | null> => {
  if (!(await shouldUseQwenVisionParser())) {
    return null
  }

  try {
    const baseOptions = await getConfiguredModelOptions()
    const runtime = createChatModelRuntime({
      ...baseOptions,
      model: SMALL_QWEN_VISION_MODEL,
      temperature: 0.1,
      streaming: false,
      useResponsesApi: false
    })

    const content = await buildQwenInputContent([file])
    content.push({
      type: 'text',
      text: '请只用一句简短中文描述这张图片的主体内容，不超过18个字，不要解释，不要序号。'
    })

    const response = await runtime.model.invoke([
      new SystemMessage('你是图片内容解析助手，只输出简洁描述。'),
      new HumanMessage({
        content: content as any
      })
    ])
    const caption = sanitizeCaption(contentToText(response.content))
    return caption || null
  } catch {
    return null
  }
}

const parseFilePartForPersistence = async (
  file: MainAgentFileContentPart
): Promise<string> => {
  if (file.mediaType === 'image') {
    const caption = await parseImageCaptionWithSmallModel(file)
    if (caption) {
      return formatFileLine(file, caption)
    }
  }

  return formatFileLine(file)
}

export const parseMainAgentContentForStorage = async (
  content: MainAgentMessageContentPart[]
): Promise<string> => {
  const lines: string[] = []

  for (const part of content) {
    if (part.type === 'text') {
      const text = part.text.trim()
      if (text) {
        lines.push(text)
      }
      continue
    }

    lines.push(await parseFilePartForPersistence(part))
  }

  return lines.filter(Boolean).join('\n') || parseMainAgentContentForPersistence(content)
}
