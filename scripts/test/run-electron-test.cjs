const {
  existsSync,
  mkdtempSync,
  rmSync
} = require('node:fs')
const { tmpdir } = require('node:os')
const { isAbsolute, join, relative, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const [targetArgument, ...environmentArguments] = process.argv.slice(2)
if (!targetArgument) {
  throw new Error('Usage: node scripts/test/run-electron-test.cjs <compiled-test> [KEY=VALUE ...]')
}

const workspaceRoot = resolve(__dirname, '..', '..')
const electronPath = require('electron')
if (!existsSync(electronPath)) {
  throw new Error(
    `Electron executable is missing at ${electronPath}. Run npm ci with the project Node version before Electron integration tests.`
  )
}

const environment = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1'
}
environment.ELECTRON_DISABLE_GPU = '1'
for (const argument of environmentArguments) {
  const separator = argument.indexOf('=')
  if (separator <= 0) {
    throw new Error(`Invalid environment argument: ${argument}`)
  }
  environment[argument.slice(0, separator)] = argument.slice(separator + 1)
}
if (environment.WORLDEDIT_AGENT_ELECTRON_APP_MODE === '1') {
  delete environment.ELECTRON_RUN_AS_NODE
  environment.WORLDEDIT_AGENT_SKIP_RESOURCE_SCHEME = '1'
}

// Real-model/integration runs must use a disposable copy of the application's
// database. Configuration is inherited from that copy, while all turns,
// traces, memories, and tool receipts stay outside the user's normal store.
let isolatedUserData
if (environment.WORLDEDIT_AGENT_ISOLATE_APP_DATA === '1') {
  const sourceDatabase = resolve(
    environment.WORLDEDIT_AGENT_SOURCE_DATABASE ||
      join(environment.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), 'worldedit-agent', 'database.sqlite')
  )
  if (!existsSync(sourceDatabase)) {
    throw new Error(`Application database does not exist: ${sourceDatabase}`)
  }
  isolatedUserData = mkdtempSync(join(tmpdir(), 'worldedit-agent-model-test-'))
  const isolatedDatabase = join(isolatedUserData, 'database.sqlite')
  environment.WORLDEDIT_AGENT_TEST_USER_DATA = isolatedUserData
  environment.WORLDEDIT_AGENT_DATABASE_PATH = isolatedDatabase
  environment.WORLDEDIT_AGENT_SOURCE_DATABASE = sourceDatabase
  environment.WORLDEDIT_AGENT_TRACE_ROOT = join(
    isolatedUserData,
    'diagnostics',
    'agent-traces'
  )
  environment.WORLDEDIT_AGENT_TEST_SESSION_ID ||= 'model-integration-test'
  environment.WORLDEDIT_AGENT_TEST_CONSUMER ||= 'model_integration_test'
}

const bootstrap = resolve(workspaceRoot, 'scripts/node-test-bootstrap.cjs')
const target = isAbsolute(targetArgument) ? targetArgument : resolve(workspaceRoot, targetArgument)
const targetRelativePath = relative(workspaceRoot, target)
if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath)) {
  throw new Error(`Electron test target must stay inside the workspace: ${target}`)
}
if (!existsSync(target)) throw new Error(`Electron test target does not exist: ${target}`)
let result
try {
  const electronArguments = environment.WORLDEDIT_AGENT_ELECTRON_APP_MODE === '1'
    ? ['--disable-gpu', bootstrap, target]
    : [bootstrap, target]
  result = spawnSync(electronPath, electronArguments, {
    cwd: workspaceRoot,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  })
} finally {
  if (isolatedUserData) {
    rmSync(isolatedUserData, { recursive: true, force: true })
  }
}

if (result.error) throw result.error
if (result.signal) {
  throw new Error(`Electron test process terminated by ${result.signal}.`)
}
process.exitCode = result.status ?? 1
