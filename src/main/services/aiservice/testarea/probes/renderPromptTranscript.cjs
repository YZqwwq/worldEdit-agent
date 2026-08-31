const fs = require('node:fs')
const path = require('node:path')

const source = process.env.WORLDEDIT_AGENT_PROMPT_FILE
if (!source) throw new Error('Set WORLDEDIT_AGENT_PROMPT_FILE')
const output = process.env.WORLDEDIT_AGENT_PROMPT_TRANSCRIPT_FILE || path.join(path.dirname(source), 'prompt-transcript.txt')
const raw = JSON.parse(fs.readFileSync(source, 'utf8'))
const messages = Array.isArray(raw) ? raw : raw.messages
const lines = [
  `MODEL: ${raw.model ?? ''}`,
  `PROFILE: ${raw.profile ?? ''}`,
  `REASONING_PROTOCOL: ${raw.reasoningProtocol ?? ''}`,
  `MESSAGE_COUNT: ${messages.length}`,
  '',
  '===== BEGIN CONTEXT MESSAGES =====',
]
messages.forEach((message, index) => {
  lines.push('', `===== MESSAGE ${index + 1} | ${message.type} | contentChars=${String(message.content ?? '').length} =====`)
  const kwargs = message.additional_kwargs && Object.keys(message.additional_kwargs).length
    ? JSON.stringify(message.additional_kwargs, null, 2)
    : '{}'
  lines.push('--- additional_kwargs ---', kwargs, '--- content ---', String(message.content ?? ''), `===== END MESSAGE ${index + 1} =====`)
})
lines.push('', '===== END CONTEXT MESSAGES =====', '')
fs.writeFileSync(output, lines.join('\n'), 'utf8')
console.log(JSON.stringify({ output, messages: messages.length, chars: lines.join('\n').length }, null, 2))
