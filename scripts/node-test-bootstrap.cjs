const webStreams = require('node:stream/web')

globalThis.ReadableStream ??= webStreams.ReadableStream
globalThis.WritableStream ??= webStreams.WritableStream
globalThis.TransformStream ??= webStreams.TransformStream

const target = process.argv[2]
if (!target) throw new Error('node-test-bootstrap requires a compiled test file path.')

const bootstrap = async () => {
  const { app } = require('electron')
  if (process.env.WORLDEDIT_AGENT_ELECTRON_APP_MODE === '1') {
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('disable-software-rasterizer')
  }
  if (process.env.WORLDEDIT_AGENT_TEST_USER_DATA) {
    // In ELECTRON_RUN_AS_NODE, app may not be initialized. Database and trace
    // locations are explicitly injected below, so setting userData is optional.
    if (app && typeof app.setPath === 'function') {
      app.setPath('userData', process.env.WORLDEDIT_AGENT_TEST_USER_DATA)
    }
  }

  // SQLite's online backup API gives us a transactionally consistent snapshot
  // even while the normal Electron application keeps its database open.
  const source = process.env.WORLDEDIT_AGENT_SOURCE_DATABASE?.trim()
  const destination = process.env.WORLDEDIT_AGENT_DATABASE_PATH?.trim()
  if (source && destination) {
    if (!require('node:fs').existsSync(source)) {
      throw new Error(`Application database does not exist: ${source}`)
    }
    const Database = require('better-sqlite3')
    const sourceDatabase = new Database(source, { readonly: true, fileMustExist: true })
    try {
      if (process.env.WORLDEDIT_AGENT_DATABASE_SEED === 'empty') {
        const targetDatabase = new Database(destination)
        try {
          const schema = sourceDatabase
            .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'modelconfig'")
            .get()
          if (schema) {
            targetDatabase.exec(schema.sql)
            const rows = sourceDatabase.prepare('SELECT * FROM modelconfig').all()
            for (const row of rows) {
              const columns = Object.keys(row)
              const names = columns.map((name) => `"${name.replaceAll('"', '""')}"`).join(',')
              targetDatabase
                .prepare(
                  `INSERT INTO modelconfig (${names}) VALUES (${columns.map(() => '?').join(',')})`
                )
                .run(...columns.map((name) => row[name]))
            }
          }
        } finally {
          targetDatabase.close()
        }
      } else {
        await sourceDatabase.backup(destination)
      }
    } finally {
      sourceDatabase.close()
    }
  }

  const resolvedTarget = require('node:path').resolve(process.cwd(), target)
  require(resolvedTarget)
}

void bootstrap().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
