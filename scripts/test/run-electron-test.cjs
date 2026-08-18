const { existsSync } = require('node:fs')
const { isAbsolute, relative, resolve } = require('node:path')
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
for (const argument of environmentArguments) {
  const separator = argument.indexOf('=')
  if (separator <= 0) {
    throw new Error(`Invalid environment argument: ${argument}`)
  }
  environment[argument.slice(0, separator)] = argument.slice(separator + 1)
}

const bootstrap = resolve(workspaceRoot, 'scripts/node-test-bootstrap.cjs')
const target = isAbsolute(targetArgument) ? targetArgument : resolve(workspaceRoot, targetArgument)
const targetRelativePath = relative(workspaceRoot, target)
if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath)) {
  throw new Error(`Electron test target must stay inside the workspace: ${target}`)
}
if (!existsSync(target)) throw new Error(`Electron test target does not exist: ${target}`)
const result = spawnSync(electronPath, [bootstrap, target], {
  cwd: workspaceRoot,
  env: environment,
  stdio: 'inherit',
  windowsHide: true
})

if (result.error) throw result.error
if (result.signal) {
  throw new Error(`Electron test process terminated by ${result.signal}.`)
}
process.exitCode = result.status ?? 1
