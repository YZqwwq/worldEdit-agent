const Database = require('better-sqlite3')

if (!process.versions.electron) {
  throw new Error('Electron native preflight must run through the Electron test runner.')
}

const database = new Database(':memory:')
try {
  const result = database.prepare('SELECT 1 AS value').get()
  if (result?.value !== 1) throw new Error('SQLite in-memory query returned an invalid result.')
} finally {
  database.close()
}

console.log(
  [
    'Electron native test environment is ready.',
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `electron=${process.versions.electron}`,
    `node=${process.versions.node}`,
    `modules=${process.versions.modules}`,
    `sqlite=${process.versions.sqlite ?? 'unknown'}`
  ].join(' ')
)
