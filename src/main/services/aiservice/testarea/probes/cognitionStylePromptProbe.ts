import { app } from 'electron'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { initDatabase, AppDataSource } from '../../../../database'
import { modelConfigService } from '../../../modelconfig/modelConfigService'
import { createConfiguredModelRuntime } from '../../model-adapters/modelProviderAdapter'

const variants = [
  ['sensory', '感性化剧本', '你需要写一段剧情。\n场景是：一个感性的读者正在阅读一段关于柯莱斯特·菲尔娜的人物文学资料。\n需要描写这位读者在阅读过程中思考菲尔娜这个人物时的复杂心理活动。（重点描写该读者的思考活动）'],
  ['rational', '理性化剧本', '你需要写一段剧情。\n场景是：一个理性的读者正在阅读一段关于柯莱斯特·菲尔娜的人物文学资料。\n需要描写这位读者在阅读过程中思考菲尔娜这个人物时的复杂心理活动。（重点描写该读者的思考活动）'],
  ['divergent', '跳脱化剧本', '你需要写一段剧情。\n场景是：一个思维跳脱、联想丰富的读者正在阅读一段关于柯莱斯特·菲尔娜的人物文学资料。\n需要描写这位读者在阅读过程中思考菲尔娜这个人物时的复杂心理活动。（重点描写该读者的思考活动）']
] as const

const characterText = `柯莱斯特·菲尔娜
外表为16岁左右的灵族少女，真实年龄在200岁以上，白发，浅红色瞳孔。她是司掌收束与发散的神明碎片，因权柄失衡撕裂神明而成为地上生灵；在“释欲”祭祀中被教徒的愿赋予形体，被“神之手”主教阿夫曼带走。她几天内学会人类语言，阿夫曼多年教育她理解神明、信仰、教会与人，后来因得不到信仰能否传达神明的答案而自尽。菲尔娜为他合上棺盖，留下遗憾与悲伤，后来成为边境领主，让领土长期中立。她在和平中追查来源，理解宏伟存在可能是参与世界运行的概念；她想要的也许不是来源，而是新的目的、欲望和憧憬。她感到某个概念在牵引自己，预感终将与神融为一体，但在那之前想继续照看臣民。如今她穿修女服祈祷，人魔冲突令她遗憾；一个危险男人把男孩交给她，请求庇护并允许她杀死自己、向两界通报消息。菲尔娜知道男人出现已将领土卷入冲突，而他掌握双方都不愿第三方知道的原因。`

async function main() {
  await initDatabase()
  const options = await modelConfigService.getModelOptions()
  if (!options.apiKey?.trim()) throw new Error('Missing model API key in application database.')
  const runtime = createConfiguredModelRuntime(options)
  const results: Array<{ id: string; label: string; content: string }> = []
  for (const [id, label, instruction] of variants) {
    const prompt = [instruction, '输出只保留这一轮新形成的内部思考文本。可以使用第一人称，但第一人称只是内部记录，不是对话台词。不要虚构材料中没有证据的具体环境、身体动作或他人反应。人物材料如下：', characterText].join('\n\n')
    const prepared = await runtime.familyAdapter.prepareMessages([new SystemMessage(prompt), new HumanMessage({ content: '开始。' })], runtime)
    const response = await runtime.model.invoke(prepared)
    results.push({ id, label, content: typeof response.content === 'string' ? response.content : JSON.stringify(response.content) })
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), model: options.model, baseURL: options.baseURL ?? null, variants: results }, null, 2))
}
void main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { if (AppDataSource.isInitialized) await AppDataSource.destroy(); app.quit() })
