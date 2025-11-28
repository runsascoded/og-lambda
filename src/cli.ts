#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function usage() {
  console.log(`
og-lambda - Scheduled Lambda for generating og:image screenshots

Usage: og-lambda <command> [options]

Commands:
  deploy     Deploy the Lambda stack
  destroy    Destroy the Lambda stack
  synth      Synthesize CloudFormation template
  invoke     Manually invoke the Lambda
  logs       Tail Lambda logs
  status     Show Lambda status

Environment Variables:
  SCREENSHOT_URL       URL to screenshot (required for deploy)
  S3_BUCKET            S3 bucket for output (required for deploy)
  S3_KEY               S3 key/path (default: og-image.jpg)
  STACK_NAME           CloudFormation stack name (default: og-lambda)
  VIEWPORT_WIDTH       Screenshot width (default: 1200)
  VIEWPORT_HEIGHT      Screenshot height (default: 630)
  WAIT_FOR_SELECTOR    CSS selector to wait for before screenshot
  WAIT_FOR_FUNCTION    JS expression that must return truthy (e.g., "window.chartReady")
  WAIT_FOR_TIMEOUT     Additional ms to wait after conditions are met
  SCHEDULE_RATE_MINUTES  How often to run (default: 60)

Examples:
  SCREENSHOT_URL=https://mysite.com S3_BUCKET=mybucket og-lambda deploy
  og-lambda logs
  og-lambda invoke
`)
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Error: ${name} environment variable is required`)
    process.exit(1)
  }
  return value
}

function getStackName(): string {
  return process.env.STACK_NAME || 'og-lambda'
}

function ensureBuilt() {
  const lambdaDir = join(projectRoot, 'dist', 'lambda')
  if (!existsSync(join(lambdaDir, 'index.js'))) {
    console.log('Building Lambda bundle...')
    execSync('pnpm build && pnpm bundle', { cwd: projectRoot, stdio: 'inherit' })
  }
}

function deploy() {
  requireEnv('SCREENSHOT_URL')
  requireEnv('S3_BUCKET')
  ensureBuilt()

  console.log('Deploying og-lambda...')
  const result = spawnSync('cdk', ['deploy', '--require-approval', 'never'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
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
  requireEnv('SCREENSHOT_URL')
  requireEnv('S3_BUCKET')
  ensureBuilt()

  const result = spawnSync('cdk', ['synth'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
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

function logs() {
  const stackName = getStackName()
  const logGroup = `/aws/lambda/${stackName}`
  console.log(`Tailing logs: ${logGroup}`)

  const result = spawnSync('aws', [
    'logs', 'tail', logGroup, '--follow',
  ], {
    stdio: 'inherit',
  })
  process.exit(result.status ?? 1)
}

function status() {
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

  // Get last invocation
  const logsResult = spawnSync('aws', [
    'logs', 'filter-log-events',
    '--log-group-name', `/aws/lambda/${stackName}`,
    '--limit', '1',
    '--query', 'events[0].{timestamp:timestamp,message:message}',
    '--output', 'table',
  ], { encoding: 'utf-8' })

  if (logsResult.status === 0 && logsResult.stdout.trim()) {
    console.log('Last Log Entry:')
    console.log(logsResult.stdout)
  }
}

// Main
const command = process.argv[2]

switch (command) {
  case 'deploy':
    deploy()
    break
  case 'destroy':
    destroy()
    break
  case 'synth':
    synth()
    break
  case 'invoke':
    invoke()
    break
  case 'logs':
    logs()
    break
  case 'status':
    status()
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
