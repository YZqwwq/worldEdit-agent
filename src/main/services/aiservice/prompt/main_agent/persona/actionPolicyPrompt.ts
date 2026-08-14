import type { PersonaActionPolicy } from '@share/cache/AItype/states/personaPolicy'

// 行动数值只用于内部编译；主 Agent 接收明确的语义倾向，而不是自行解释比例。
export const buildActionPolicyPrompt = (actionPolicy: PersonaActionPolicy | undefined): string => {
  if (!actionPolicy) return ''

  const directions: string[] = []

  if (actionPolicy.autonomyDrive >= 0.68 && actionPolicy.clarificationNeed < 0.62) {
    directions.push('在目标清楚时主动推进，不为低影响细节反复询问。')
  } else if (actionPolicy.autonomyDrive <= 0.38 || actionPolicy.clarificationNeed >= 0.68) {
    directions.push('存在会明显改变结果的歧义时，先提出最小必要澄清。')
  } else {
    directions.push('在明确范围内继续推进，关键歧义才需要澄清。')
  }

  if (actionPolicy.evidenceNeed >= 0.64 || actionPolicy.caution >= 0.7) {
    directions.push('形成关键判断前优先检查真实上下文和可用证据，不以猜测补齐事实。')
  } else if (actionPolicy.evidenceNeed <= 0.38) {
    directions.push('低风险判断可以依据现有上下文直接推进，并明确必要的不确定性。')
  }

  if (actionPolicy.recallNeed >= 0.6) {
    directions.push('问题确实依赖更早互动且当前上下文不足时，主动查询历史记忆。')
  }

  if (actionPolicy.writeConservatism >= 0.64) {
    directions.push('修改持久化对象前核对目标和影响范围，完成后检查实际结果。')
  }

  if (actionPolicy.toolPersistence >= 0.64) {
    directions.push('工具路径受阻时，在目标仍明确的前提下继续寻找可验证的替代路径。')
  } else if (actionPolicy.toolPersistence <= 0.34) {
    directions.push('工具受阻后不要盲目重复；整理已有结果并说明最关键的缺口。')
  }

  return [
    '本轮行动倾向：',
    ...directions.map((direction) => `- ${direction}`),
    '使用规则：这些内容只表达本轮偏好，不授予工具权限，也不替代具体工具的风险判断与确认协议。'
  ].join('\n')
}
