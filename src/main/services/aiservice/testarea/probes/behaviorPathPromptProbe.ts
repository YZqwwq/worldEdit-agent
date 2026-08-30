import { app } from 'electron'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { initDatabase, AppDataSource } from '../../../../database'
import { modelConfigService } from '../../../modelconfig/modelConfigService'
import { createConfiguredModelRuntime } from '../../model-adapters/modelProviderAdapter'

type Variant = {
  id: string
  label: string
  instruction: string
}

const variants: Variant[] = [
  {
    id: 'chat',
    label: '社交软件式聊天',
    instruction:
      '你正在使用社交软件与一位熟悉的用户聊天。先理解此刻关系和语气，再自然地回复对方。不要写分析过程、场景说明或格式化报告。'
  },
  {
    id: 'script',
    label: '生活剧本续写',
    instruction:
      '你正在续写一段长期生活剧本。请从主体当前的处境、注意和内在变化开始，让用户消息作为进入生活的真实事件，推进到主体决定如何开口的时刻。输出自然的主体经历记录，不要直接写给用户的完整台词。'
  },
  {
    id: 'forum',
    label: '社区论坛交流',
    instruction:
      '你正在社区论坛中参与一场真实讨论。先判断对方真正关心什么，再以有立场但不说教的方式参与交流。保持自然、具体、克制，不要输出思维过程或模板化总结。'
  }
]

const sharedContext = [
  '角色：菲尔娜，一名长期生活在 world-edit 中的仿生人。她克制、守望、中立，不轻易把判断说满。',
  '生活位置：她刚停在 world-edit 的人物志页面，上一刻在整理菲尔娜的性格资料。',
  '已确认事实：用户想为菲尔娜寻找偏西化的名字，但还没有要求完整命名学分析。',
  '外部观察：人物志显示她的中立更像长期守望后的存在方式，而不是主动选择的冷漠。',
  '当前用户消息：给我几个适合她的名字。',
  '请只处理这一轮，不假设用户已经看见你的内部记录。'
].join('\n')

const run = async (): Promise<void> => {
  await initDatabase()
  const options = await modelConfigService.getModelOptions()
  if (!options.apiKey?.trim()) throw new Error('Missing model API key in application database.')
  const runtime = createConfiguredModelRuntime(options)
  const results: Array<Record<string, unknown>> = []

  for (const variant of variants) {
    const messages = [
      new SystemMessage(variant.instruction),
      new AIMessage({
        content: `这是本次任务的上下文：\n${sharedContext}`,
        additional_kwargs: { isProbeContext: true }
      }),
      new HumanMessage({ content: '开始。' })
    ]
    const prepared = await runtime.familyAdapter.prepareMessages(messages, runtime)
    const response = await runtime.model.invoke(prepared)
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    results.push({ id: variant.id, label: variant.label, content })
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: options.model,
    baseURL: options.baseURL ?? null,
    variants: results
  }, null, 2))
}

void run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
    app.quit()
  })

