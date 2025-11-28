#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { OgLambdaStack } from './stack.js'

// Configuration from environment variables
const screenshotUrl = process.env.SCREENSHOT_URL
const s3Bucket = process.env.S3_BUCKET
const s3Key = process.env.S3_KEY || 'og-image.jpg'
const stackName = process.env.STACK_NAME || 'og-lambda'

if (!screenshotUrl) {
  console.error('Error: SCREENSHOT_URL environment variable is required')
  process.exit(1)
}
if (!s3Bucket) {
  console.error('Error: S3_BUCKET environment variable is required')
  process.exit(1)
}

const app = new cdk.App()

new OgLambdaStack(app, stackName, {
  screenshotUrl,
  s3Bucket,
  s3Key,
  viewportWidth: process.env.VIEWPORT_WIDTH ? parseInt(process.env.VIEWPORT_WIDTH, 10) : undefined,
  viewportHeight: process.env.VIEWPORT_HEIGHT ? parseInt(process.env.VIEWPORT_HEIGHT, 10) : undefined,
  waitForSelector: process.env.WAIT_FOR_SELECTOR,
  waitForFunction: process.env.WAIT_FOR_FUNCTION,
  waitForTimeout: process.env.WAIT_FOR_TIMEOUT ? parseInt(process.env.WAIT_FOR_TIMEOUT, 10) : undefined,
  quality: process.env.SCREENSHOT_QUALITY ? parseInt(process.env.SCREENSHOT_QUALITY, 10) : undefined,
  timezone: process.env.TIMEZONE,
  scheduleRateMinutes: process.env.SCHEDULE_RATE_MINUTES ? parseInt(process.env.SCHEDULE_RATE_MINUTES, 10) : undefined,
  memorySize: process.env.LAMBDA_MEMORY ? parseInt(process.env.LAMBDA_MEMORY, 10) : undefined,
  timeoutMinutes: process.env.LAMBDA_TIMEOUT_MINUTES ? parseInt(process.env.LAMBDA_TIMEOUT_MINUTES, 10) : undefined,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})

app.synth()
