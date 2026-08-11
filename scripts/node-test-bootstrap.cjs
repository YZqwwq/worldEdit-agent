const webStreams = require('node:stream/web')

globalThis.ReadableStream ??= webStreams.ReadableStream
globalThis.WritableStream ??= webStreams.WritableStream
globalThis.TransformStream ??= webStreams.TransformStream

const target = process.argv[2]
if (!target) throw new Error('node-test-bootstrap requires a compiled test file path.')
require(require('node:path').resolve(process.cwd(), target))
