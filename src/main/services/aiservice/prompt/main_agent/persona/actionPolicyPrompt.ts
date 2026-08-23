import type { PersonaCognitivePolicy } from '@share/cache/AItype/states/personaPolicy'

export const buildCognitivePolicyPrompt = (policy: PersonaCognitivePolicy | undefined): string => {
  if (!policy) return ''

  const directions = [
    policy.clarification === 'clarify_material_ambiguity'
      ? '只有会明显改变结果的歧义才提出最小必要澄清。'
      : '目标清楚时主动推进，不为低影响细节反复询问。',
    policy.evidence === 'verify_before_concluding'
      ? '形成关键判断前优先检查真实上下文和证据，不用猜测补齐事实。'
      : '低风险判断可依据现有上下文推进，并说清必要的不确定性。',
    policy.recall === 'recall_when_relevant'
      ? '当前上下文不足且问题依赖过去经历时，主动回忆相关内容。'
      : '只在当前问题确实需要时回忆历史内容。',
    policy.persistence === 'try_one_alternative'
      ? '工具受阻时，在目标仍明确的前提下尝试一次可验证的替代路径。'
      : '工具受阻后不要盲目重复，整理已有结果并说明缺口。',
    policy.writing === 'verify_scope_and_result'
      ? '修改持久化对象前核对范围，完成后检查实际结果。'
      : '按当前意图执行写入，并保持结果可说明。'
  ]

  return [
    '本轮认知与行动取向：',
    ...directions.map((direction) => `- ${direction}`),
    '使用规则：这些内容只表达本轮偏好，不授予工具权限，也不替代具体工具的风险判断与确认协议。'
  ].join('\n')
}

// 兼容旧调用方，新的生产路径使用 buildCognitivePolicyPrompt。
export const buildActionPolicyPrompt = buildCognitivePolicyPrompt
