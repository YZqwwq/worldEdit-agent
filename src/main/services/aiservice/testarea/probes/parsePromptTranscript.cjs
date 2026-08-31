const fs = require('node:fs')
const path = require('node:path')

const source = process.env.WORLDEDIT_AGENT_PROMPT_TRANSCRIPT_FILE
if (!source) throw new Error('Set WORLDEDIT_AGENT_PROMPT_TRANSCRIPT_FILE')
const output = process.env.WORLDEDIT_AGENT_PROMPT_FILE || path.join(path.dirname(source), 'prompt-from-transcript.json')
const text = fs.readFileSync(source, 'utf8')
const model = text.match(/^MODEL:\s*(.*)$/m)?.[1]?.trim() || ''
const profile = text.match(/^PROFILE:\s*(.*)$/m)?.[1]?.trim() || ''
const reasoningProtocol = text.match(/^REASONING_PROTOCOL:\s*(.*)$/m)?.[1]?.trim() || ''
const blockPattern = /^===== MESSAGE (\d+) \| ([^|]+) \|[^\n]*=====\r?\n--- additional_kwargs ---\r?\n([\s\S]*?)\r?\n--- content ---\r?\n([\s\S]*?)\r?\n===== END MESSAGE \1 =====$/gm
const messages = []
for (const match of text.matchAll(blockPattern)) {
  const additional = match[3].trim()
  messages.push({
    type: match[2].trim(),
    content: match[4],
    additional_kwargs: additional ? JSON.parse(additional) : {}
  })
}
if (!messages.length) throw new Error('No transcript message blocks found')
fs.writeFileSync(output, JSON.stringify({ model, profile, reasoningProtocol, variant: 'user-edited-transcript', messages }, null, 2), 'utf8')
console.log(JSON.stringify({ output, model, profile, reasoningProtocol, messages: messages.length, contentChars: messages.reduce((sum, message) => sum + message.content.length, 0) }, null, 2))
