const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const [targetArgument, ...environmentArguments] = process.argv.slice(2)
if (!targetArgument) {
  throw new Error('Usage: node scripts/test/run-electron-test.cjs <compiled-test> [KEY=VALUE ...]')
}

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

const bootstrap = resolve(process.cwd(), 'scripts/node-test-bootstrap.cjs')
const target = resolve(process.cwd(), targetArgument)
const result = spawnSync(electronPath, [bootstrap, target], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit'
})

if (result.error) throw result.error
if (result.signal) {
  throw new Error(`Electron test process terminated by ${result.signal}.`)
}
process.exitCode = result.status ?? 1
