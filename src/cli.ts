#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// Config file support
interface OgLambdaConfig {
  stackName?: string
  screenshotUrl?: string
  s3Bucket?: string
  s3Key?: string
  viewportWidth?: number
  viewportHeight?: number
  waitForSelector?: string
  waitForFunction?: string
  waitForTimeout?: number
  scheduleRateMinutes?: number
  timezone?: string
}

const CONFIG_FILENAMES = ['.og-lambda.json', 'og-lambda.config.json']

function findConfigFile(startDir: string): string | null {
  let dir = startDir
  const { root } = parse(dir)

  while (dir !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = join(dir, filename)
      if (existsSync(configPath)) {
        return configPath
      }
    }
    dir = dirname(dir)
  }
  return null
}

let configPath: string | null = null
let config: OgLambdaConfig = {}

function loadConfig(): void {
  configPath = findConfigFile(process.cwd())
  if (!configPath) return

  try {
    const content = readFileSync(configPath, 'utf-8')
    config = JSON.parse(content)
  } catch (e) {
    console.error(`Warning: Failed to parse config file ${configPath}`)
    config = {}
  }
}

// Load config on startup
loadConfig()

function usage() {
  console.log(`
og-lambda - Scheduled Lambda for generating og:image screenshots

Usage: og-lambda <command> [options]

Commands:
  config     Show resolved configuration
  deploy     Deploy the Lambda stack
  destroy    Destroy the Lambda stack
  invoke     Manually invoke the Lambda
  logs       Show recent logs (use -f to tail)
  status     Show Lambda status and next run time
  synth      Synthesize CloudFormation template

Config File:
  Create .og-lambda.json or og-lambda.config.json in your project:

  {
    "stackName": "myproject-og",
    "screenshotUrl": "https://mysite.com",
    "s3Bucket": "my-bucket",
    "s3Key": "og-image.jpg"
  }

  Environment variables override config file values.

Config Keys / Environment Variables:
  stackName / STACK_NAME              CloudFormation stack name (default: og-lambda)
  screenshotUrl / SCREENSHOT_URL      URL to screenshot (required for deploy)
  s3Bucket / S3_BUCKET                S3 bucket for output (required for deploy)
  s3Key / S3_KEY                      S3 key/path (default: og-image.jpg)
  viewportWidth / VIEWPORT_WIDTH      Screenshot width (default: 1200)
  viewportHeight / VIEWPORT_HEIGHT    Screenshot height (default: 630)
  waitForSelector / WAIT_FOR_SELECTOR CSS selector to wait for before screenshot
  waitForFunction / WAIT_FOR_FUNCTION JS expression that must return truthy
  waitForTimeout / WAIT_FOR_TIMEOUT   Additional ms to wait after conditions are met
  scheduleRateMinutes / SCHEDULE_RATE_MINUTES  How often to run (default: 60)
  timezone / TIMEZONE                 Timezone for page rendering

Examples:
  og-lambda deploy              # Uses config file
  og-lambda status
  STACK_NAME=other og-lambda status   # Override config
`)
}

// Map of env var names to config keys
const ENV_TO_CONFIG: Record<string, keyof OgLambdaConfig> = {
  STACK_NAME: 'stackName',
  SCREENSHOT_URL: 'screenshotUrl',
  S3_BUCKET: 's3Bucket',
  S3_KEY: 's3Key',
  VIEWPORT_WIDTH: 'viewportWidth',
  VIEWPORT_HEIGHT: 'viewportHeight',
  WAIT_FOR_SELECTOR: 'waitForSelector',
  WAIT_FOR_FUNCTION: 'waitForFunction',
  WAIT_FOR_TIMEOUT: 'waitForTimeout',
  SCHEDULE_RATE_MINUTES: 'scheduleRateMinutes',
  TIMEZONE: 'timezone',
}

function getConfigValue(envName: string): string | undefined {
  const configKey = ENV_TO_CONFIG[envName]
  const envValue = process.env[envName]
  if (envValue) return envValue
  if (configKey && config[configKey] !== undefined) {
    return String(config[configKey])
  }
  return undefined
}

function requireConfig(envName: string): string {
  const value = getConfigValue(envName)
  const configKey = ENV_TO_CONFIG[envName]
  if (!value) {
    const msg = configKey
      ? `Error: Set ${envName} env var or '${configKey}' in config file`
      : `Error: ${envName} environment variable is required`
    console.error(msg)
    process.exit(1)
  }
  return value
}

function getStackName(): string {
  return getConfigValue('STACK_NAME') || 'og-lambda'
}

function ensureBuilt() {
  const lambdaDir = join(projectRoot, 'dist', 'lambda')
  if (!existsSync(join(lambdaDir, 'index.js'))) {
    console.log('Building Lambda bundle...')
    execSync('pnpm build && pnpm bundle', { cwd: projectRoot, stdio: 'inherit' })
  }
}

function deploy() {
  requireConfig('SCREENSHOT_URL')
  requireConfig('S3_BUCKET')
  ensureBuilt()

  // Pass config values as env vars to CDK
  const env = { ...process.env }
  for (const [envName, configKey] of Object.entries(ENV_TO_CONFIG)) {
    const value = getConfigValue(envName)
    if (value && !process.env[envName]) {
      env[envName] = value
    }
  }

  console.log('Deploying og-lambda...')
  const result = spawnSync('cdk', ['deploy', '--require-approval', 'never'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  })
  process.exit(result.status ?? 1)
}

function destroy() {
  const stackName = getStackName()
  console.log(`Destroying stack: ${stackName}`)
  const result = spawnSync('cdk', ['destroy', '--force'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

function synth() {
  requireConfig('SCREENSHOT_URL')
  requireConfig('S3_BUCKET')
  ensureBuilt()

  // Pass config values as env vars to CDK
  const env = { ...process.env }
  for (const [envName] of Object.entries(ENV_TO_CONFIG)) {
    const value = getConfigValue(envName)
    if (value && !process.env[envName]) {
      env[envName] = value
    }
  }

  const result = spawnSync('cdk', ['synth'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  })
  process.exit(result.status ?? 1)
}

function invoke() {
  const stackName = getStackName()
  console.log(`Invoking Lambda: ${stackName}`)

  const result = spawnSync('aws', [
    'lambda', 'invoke',
    '--function-name', stackName,
    '--log-type', 'Tail',
    '--query', 'LogResult',
    '--output', 'text',
    '/dev/stdout',
  ], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function logs(args: string[]) {
  // Handle --help
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
og-lambda logs - View Lambda logs

Usage: og-lambda logs [options]

Options:
  -f, --follow    Tail logs continuously (default: show recent logs)
  -h, --help      Show this help
`)
    return
  }

  const stackName = getStackName()
  const logGroup = `/aws/lambda/${stackName}`
  const follow = args.includes('-f') || args.includes('--follow')

  if (follow) {
    console.log(`Tailing logs: ${logGroup}`)
    const result = spawnSync('aws', [
      'logs', 'tail', logGroup, '--follow',
    ], {
      stdio: 'inherit',
    })
    process.exit(result.status ?? 1)
  } else {
    console.log(`Recent logs: ${logGroup}\n`)
    const result = spawnSync('aws', [
      'logs', 'tail', logGroup, '--since', '1h',
    ], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

function showConfig() {
  if (configPath) {
    console.log(`Config file: ${configPath}\n`)
  } else {
    console.log('Config file: (none found)\n')
  }

  const defaults: Record<string, string> = {
    STACK_NAME: 'og-lambda',
    S3_KEY: 'og-image.jpg',
    VIEWPORT_WIDTH: '1200',
    VIEWPORT_HEIGHT: '630',
    SCHEDULE_RATE_MINUTES: '60',
  }

  console.log('Resolved configuration:')
  for (const [envName, configKey] of Object.entries(ENV_TO_CONFIG)) {
    const envValue = process.env[envName]
    const cfgValue = config[configKey]
    const defaultValue = defaults[envName]

    let value: string | undefined
    let source: string

    if (envValue) {
      value = envValue
      source = 'env'
    } else if (cfgValue !== undefined) {
      value = String(cfgValue)
      source = 'config'
    } else if (defaultValue) {
      value = defaultValue
      source = 'default'
    } else {
      value = undefined
      source = ''
    }

    if (value !== undefined) {
      console.log(`  ${configKey}: ${value} (${source})`)
    }
  }
}

function status(args: string[]) {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
og-lambda status - Show Lambda status and next scheduled run

Usage: og-lambda status

Shows:
  - Config file location (if found)
  - Lambda function state, memory, timeout
  - Schedule rule and expression
  - Last run time and next scheduled run
`)
    return
  }

  if (configPath) {
    console.log(`Config: ${configPath}`)
  }
  const stackName = getStackName()

  console.log(`Stack: ${stackName}\n`)

  // Get function info
  const fnResult = spawnSync('aws', [
    'lambda', 'get-function',
    '--function-name', stackName,
    '--query', 'Configuration.{State:State,LastModified:LastModified,MemorySize:MemorySize,Timeout:Timeout}',
    '--output', 'table',
  ], { encoding: 'utf-8' })

  if (fnResult.status === 0) {
    console.log('Lambda Function:')
    console.log(fnResult.stdout)
  } else {
    console.log('Lambda not found or not deployed')
    return
  }

  // Get schedule rule info
  const ruleResult = spawnSync('aws', [
    'events', 'describe-rule',
    '--name', `${stackName}-schedule`,
    '--query', '{State:State,ScheduleExpression:ScheduleExpression}',
    '--output', 'table',
  ], { encoding: 'utf-8' })

  if (ruleResult.status === 0) {
    console.log('Schedule Rule:')
    console.log(ruleResult.stdout)
  }

  // Get last invocation time from most recent log stream
  const logsResult = spawnSync('aws', [
    'logs', 'describe-log-streams',
    '--log-group-name', `/aws/lambda/${stackName}`,
    '--order-by', 'LastEventTime',
    '--descending',
    '--limit', '1',
    '--query', 'logStreams[0].lastEventTimestamp',
    '--output', 'text',
  ], { encoding: 'utf-8' })

  if (logsResult.status === 0 && logsResult.stdout.trim() && logsResult.stdout.trim() !== 'None') {
    const timestamp = parseInt(logsResult.stdout.trim(), 10)
    const lastRun = new Date(timestamp)
    const now = new Date()
    const ago = Math.round((now.getTime() - timestamp) / 60000) // minutes ago

    // Parse schedule rate from rule output
    let scheduleMinutes = 60 // default
    if (ruleResult.status === 0) {
      const rateMatch = ruleResult.stdout.match(/rate\((\d+)\s*(minute|hour|day)/i)
      if (rateMatch) {
        const value = parseInt(rateMatch[1], 10)
        const unit = rateMatch[2].toLowerCase()
        if (unit === 'hour') scheduleMinutes = value * 60
        else if (unit === 'day') scheduleMinutes = value * 1440
        else scheduleMinutes = value
      }
    }

    const nextRun = new Date(timestamp + scheduleMinutes * 60000)
    const untilNext = Math.round((nextRun.getTime() - now.getTime()) / 60000)

    console.log('Last Run:')
    console.log(`  ${lastRun.toISOString()} (${ago} min ago)`)
    console.log(`  Next: ${nextRun.toISOString()} (in ${untilNext} min)\n`)
  }
}

// Main
const command = process.argv[2]

switch (command) {
  case 'config':
    showConfig()
    break
  case 'deploy':
    deploy()
    break
  case 'destroy':
    destroy()
    break
  case 'invoke':
    invoke()
    break
  case 'logs':
    logs(process.argv.slice(3))
    break
  case 'status':
    status(process.argv.slice(3))
    break
  case 'synth':
    synth()
    break
  case '-h':
  case '--help':
  case undefined:
    usage()
    break
  default:
    console.error(`Unknown command: ${command}`)
    usage()
    process.exit(1)
}
