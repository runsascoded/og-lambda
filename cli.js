#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const CONFIG_FILENAMES = ['.og-lambda.json', 'og-lambda.config.json'];
function findConfigFile(startDir) {
    let dir = startDir;
    const { root } = parse(dir);
    while (dir !== root) {
        for (const filename of CONFIG_FILENAMES) {
            const configPath = join(dir, filename);
            if (existsSync(configPath)) {
                return configPath;
            }
        }
        dir = dirname(dir);
    }
    return null;
}
let configPath = null;
let config = {};
function loadConfig() {
    configPath = findConfigFile(process.cwd());
    if (!configPath)
        return;
    try {
        const content = readFileSync(configPath, 'utf-8');
        config = JSON.parse(content);
    }
    catch (e) {
        console.error(`Warning: Failed to parse config file ${configPath}`);
        config = {};
    }
}
// Load config on startup
loadConfig();
function usage() {
    console.log(`
og-lambda - Scheduled Lambda for generating og:image screenshots

Usage: og-lambda <command> [options]

Commands:
  config     Show resolved configuration
  deploy     Deploy the Lambda stack
  destroy    Destroy the Lambda stack
  invoke     Manually invoke the Lambda
  logs       Tail Lambda logs
  status     Show Lambda status
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
`);
}
// Map of env var names to config keys
const ENV_TO_CONFIG = {
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
};
function getConfigValue(envName) {
    const configKey = ENV_TO_CONFIG[envName];
    const envValue = process.env[envName];
    if (envValue)
        return envValue;
    if (configKey && config[configKey] !== undefined) {
        return String(config[configKey]);
    }
    return undefined;
}
function requireConfig(envName) {
    const value = getConfigValue(envName);
    const configKey = ENV_TO_CONFIG[envName];
    if (!value) {
        const msg = configKey
            ? `Error: Set ${envName} env var or '${configKey}' in config file`
            : `Error: ${envName} environment variable is required`;
        console.error(msg);
        process.exit(1);
    }
    return value;
}
function getStackName() {
    return getConfigValue('STACK_NAME') || 'og-lambda';
}
function ensureBuilt() {
    const lambdaDir = join(projectRoot, 'dist', 'lambda');
    if (!existsSync(join(lambdaDir, 'index.js'))) {
        console.log('Building Lambda bundle...');
        execSync('pnpm build && pnpm bundle', { cwd: projectRoot, stdio: 'inherit' });
    }
}
function deploy() {
    requireConfig('SCREENSHOT_URL');
    requireConfig('S3_BUCKET');
    ensureBuilt();
    // Pass config values as env vars to CDK
    const env = { ...process.env };
    for (const [envName, configKey] of Object.entries(ENV_TO_CONFIG)) {
        const value = getConfigValue(envName);
        if (value && !process.env[envName]) {
            env[envName] = value;
        }
    }
    console.log('Deploying og-lambda...');
    const result = spawnSync('cdk', ['deploy', '--require-approval', 'never'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env,
    });
    process.exit(result.status ?? 1);
}
function destroy() {
    const stackName = getStackName();
    console.log(`Destroying stack: ${stackName}`);
    const result = spawnSync('cdk', ['destroy', '--force'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env,
    });
    process.exit(result.status ?? 1);
}
function synth() {
    requireConfig('SCREENSHOT_URL');
    requireConfig('S3_BUCKET');
    ensureBuilt();
    // Pass config values as env vars to CDK
    const env = { ...process.env };
    for (const [envName] of Object.entries(ENV_TO_CONFIG)) {
        const value = getConfigValue(envName);
        if (value && !process.env[envName]) {
            env[envName] = value;
        }
    }
    const result = spawnSync('cdk', ['synth'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env,
    });
    process.exit(result.status ?? 1);
}
function invoke() {
    const stackName = getStackName();
    console.log(`Invoking Lambda: ${stackName}`);
    const result = spawnSync('aws', [
        'lambda', 'invoke',
        '--function-name', stackName,
        '--log-type', 'Tail',
        '--query', 'LogResult',
        '--output', 'text',
        '/dev/stdout',
    ], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
function logs() {
    const stackName = getStackName();
    const logGroup = `/aws/lambda/${stackName}`;
    console.log(`Tailing logs: ${logGroup}`);
    const result = spawnSync('aws', [
        'logs', 'tail', logGroup, '--follow',
    ], {
        stdio: 'inherit',
    });
    process.exit(result.status ?? 1);
}
function showConfig() {
    if (configPath) {
        console.log(`Config file: ${configPath}\n`);
    }
    else {
        console.log('Config file: (none found)\n');
    }
    const defaults = {
        STACK_NAME: 'og-lambda',
        S3_KEY: 'og-image.jpg',
        VIEWPORT_WIDTH: '1200',
        VIEWPORT_HEIGHT: '630',
        SCHEDULE_RATE_MINUTES: '60',
    };
    console.log('Resolved configuration:');
    for (const [envName, configKey] of Object.entries(ENV_TO_CONFIG)) {
        const envValue = process.env[envName];
        const cfgValue = config[configKey];
        const defaultValue = defaults[envName];
        let value;
        let source;
        if (envValue) {
            value = envValue;
            source = 'env';
        }
        else if (cfgValue !== undefined) {
            value = String(cfgValue);
            source = 'config';
        }
        else if (defaultValue) {
            value = defaultValue;
            source = 'default';
        }
        else {
            value = undefined;
            source = '';
        }
        if (value !== undefined) {
            console.log(`  ${configKey}: ${value} (${source})`);
        }
    }
}
function status() {
    if (configPath) {
        console.log(`Config: ${configPath}`);
    }
    const stackName = getStackName();
    console.log(`Stack: ${stackName}\n`);
    // Get function info
    const fnResult = spawnSync('aws', [
        'lambda', 'get-function',
        '--function-name', stackName,
        '--query', 'Configuration.{State:State,LastModified:LastModified,MemorySize:MemorySize,Timeout:Timeout}',
        '--output', 'table',
    ], { encoding: 'utf-8' });
    if (fnResult.status === 0) {
        console.log('Lambda Function:');
        console.log(fnResult.stdout);
    }
    else {
        console.log('Lambda not found or not deployed');
        return;
    }
    // Get schedule rule info
    const ruleResult = spawnSync('aws', [
        'events', 'describe-rule',
        '--name', `${stackName}-schedule`,
        '--query', '{State:State,ScheduleExpression:ScheduleExpression}',
        '--output', 'table',
    ], { encoding: 'utf-8' });
    if (ruleResult.status === 0) {
        console.log('Schedule Rule:');
        console.log(ruleResult.stdout);
    }
    // Get last invocation
    const logsResult = spawnSync('aws', [
        'logs', 'filter-log-events',
        '--log-group-name', `/aws/lambda/${stackName}`,
        '--limit', '1',
        '--query', 'events[0].{timestamp:timestamp,message:message}',
        '--output', 'table',
    ], { encoding: 'utf-8' });
    if (logsResult.status === 0 && logsResult.stdout.trim()) {
        console.log('Last Log Entry:');
        console.log(logsResult.stdout);
    }
}
// Main
const command = process.argv[2];
switch (command) {
    case 'config':
        showConfig();
        break;
    case 'deploy':
        deploy();
        break;
    case 'destroy':
        destroy();
        break;
    case 'invoke':
        invoke();
        break;
    case 'logs':
        logs();
        break;
    case 'status':
        status();
        break;
    case 'synth':
        synth();
        break;
    case '-h':
    case '--help':
    case undefined:
        usage();
        break;
    default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exit(1);
}
//# sourceMappingURL=cli.js.map