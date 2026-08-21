const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const workspaceRoot = resolve(__dirname, '..', '..')
const electronRunner = resolve(__dirname, 'run-electron-test.cjs')
const preflightTarget = resolve(__dirname, 'electron-native-preflight.cjs')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const suites = [
  {
    id: 'tool-effect',
    buildScript: 'build:test:tool-effect',
    target: 'src/main/services/aiservice/testarea/.generated/tool-effect-receipt-test.cjs',
    environment: ['RUN_TOOL_EFFECT_SQLITE_TESTS=1']
  },
  {
    id: 'document-version',
    buildScript: 'build:test:document-version',
    target: 'src/main/services/aiservice/testarea/.generated/world-document-version-test.cjs',
    environment: ['RUN_DOCUMENT_VERSION_SQLITE_TESTS=1']
  },
  {
    id: 'world-cognition',
    buildScript: 'build:test:world-cognition',
    target: 'src/main/services/aiservice/testarea/.generated/world-cognition-test.cjs',
    environment: ['RUN_WORLD_COGNITION_SQLITE_TESTS=1']
  },
  {
    id: 'turn-version',
    buildScript: 'build:test:turn-version',
    target: 'src/main/services/aiservice/testarea/.generated/turn-version-test.cjs',
    environment: ['RUN_TURN_VERSION_SQLITE_TESTS=1']
  },
  {
    id: 'tool-effect-recovery',
    buildScript: 'build:test:tool-effect-recovery-process',
    target:
      'src/main/services/aiservice/testarea/.generated/tool-effect-recovery-process-test.cjs',
    environment: []
  },
  {
    id: 'turn-recovery',
    buildScript: 'build:test:turn-recovery-process',
    target: 'src/main/services/aiservice/testarea/.generated/turn-recovery-process-test.cjs',
    environment: []
  }
]

const fail = (message) => {
  console.error(message)
  process.exitCode = 1
}

const run = (command, args, label, options = {}) => {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    shell: options.shell === true
  })
  if (result.error) throw result.error
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}.`)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`)
}

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
if (process.argv.includes('--list')) {
  console.log(suites.map((suite) => suite.id).join('\n'))
  process.exit(0)
}

const selected =
  requested.length === 0 || requested.includes('all')
    ? suites
    : requested.map((id) => {
        const suite = suites.find((candidate) => candidate.id === id)
        if (!suite) throw new Error(`Unknown Electron integration suite: ${id}`)
        return suite
      })

try {
  if (!existsSync(electronRunner) || !existsSync(preflightTarget)) {
    throw new Error('Electron integration test support files are incomplete.')
  }
  run(process.execPath, [electronRunner, preflightTarget], 'Electron native environment preflight')
  for (const suite of selected) {
    run(npmCommand, ['run', suite.buildScript], `Build ${suite.id}`, {
      shell: process.platform === 'win32'
    })
    run(
      process.execPath,
      [electronRunner, suite.target, ...suite.environment],
      `Run ${suite.id}`
    )
  }
  console.log(`\nElectron integration suites passed: ${selected.map((suite) => suite.id).join(', ')}`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
