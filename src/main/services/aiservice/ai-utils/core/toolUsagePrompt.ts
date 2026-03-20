import type { DynamicStructuredTool } from '@langchain/core/tools'
import { isAgentTool } from './agentTool'

export function buildToolUsageSystemPrompt(
  toolRegistry: Record<string, DynamicStructuredTool>
): string | null {
  const tools = Object.values(toolRegistry).filter(isAgentTool)
  if (tools.length === 0) {
    return null
  }

  const toolSections = tools
    .map((registeredTool, index) => {
      const metadata = registeredTool.agentMetadata
      const lines = [
        `${index + 1}. ${registeredTool.name}`,
        `用途：${registeredTool.baseDescription}`,
        `何时使用：${metadata.whenToUse.join('；')}`,
        `不要使用：${metadata.whenNotToUse?.join('；') || '当问题不需要该工具时不要调用。'}`,
        `输入：${metadata.inputSummary}`,
        `输出：${metadata.outputSummary}`,
        `风险级别：${metadata.riskLevel}；只读：${metadata.readOnly ? '是' : '否'}；幂等：${metadata.idempotent ? '是' : '否'}`
      ]

      if (metadata.examples?.length) {
        lines.push(`示例：${metadata.examples.join('；')}`)
      }

      return lines.join('\n')
    })
    .join('\n\n')

  return [
    '工具使用规则：',
    '1. 遇到本地数据库、世界观状态、配置或其他真实系统状态问题时，优先调用工具确认，不要猜测。',
    '2. 在执行写入、删除或修改类动作前，先使用只读工具确认目标对象存在且上下文准确。',
    '3. 如果工具返回 ok=false，必须依据 error/message 向用户说明限制或失败原因，不要伪造成功结果。',
    '4. 如果用户问题可以被工具精确回答，应优先依据工具结果作答，而不是依赖通用常识推断。',
    '5. 当没有合适工具时，再明确告诉用户当前能力边界。',
    '',
    '当前可用工具：',
    toolSections
  ].join('\n')
}
