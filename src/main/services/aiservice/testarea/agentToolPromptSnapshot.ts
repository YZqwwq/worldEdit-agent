import { z } from 'zod'
import { getMainAgentToolEntriesForPhase, mainAgentToolsets } from '../ai-utils/toolkits/mainAgentToolRegistry'
import { buildToolUsageSystemPrompt } from '../ai-utils/core/toolUsagePrompt'

const entries = getMainAgentToolEntriesForPhase('cognition')
const prompt = buildToolUsageSystemPrompt(entries, undefined, mainAgentToolsets)
console.log('=== SYSTEM tool-usage ===')
console.log(prompt ?? '(none)')
console.log(`=== BOUND TOOLS (${entries.length}) ===`)
for (const entry of entries) {
  console.log(`\n--- ${entry.tool.name} ---`)
  console.log(entry.tool.description)
  console.log('Input schema:')
  console.log(JSON.stringify(z.toJSONSchema(entry.tool.inputSchema), null, 2))
}
