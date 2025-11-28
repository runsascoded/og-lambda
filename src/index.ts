import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { takeScreenshot, type ScreenshotOptions } from './screenshot.js'

export { takeScreenshot, type ScreenshotOptions, type ScreenshotResult } from './screenshot.js'

export interface LambdaConfig {
  url: string
  s3Bucket: string
  s3Key: string
  width?: number
  height?: number
  waitForSelector?: string
  waitForFunction?: string
  waitForTimeout?: number
  quality?: number
  timezone?: string
}

export interface LambdaEvent {
  url?: string
  s3Bucket?: string
  s3Key?: string
  width?: number
  height?: number
  waitForSelector?: string
  waitForFunction?: string
  waitForTimeout?: number
  quality?: number
  timezone?: string
}

export interface LambdaResult {
  statusCode: number
  body: string
  s3Uri?: string
}

function getConfig(event: LambdaEvent): LambdaConfig {
  const url = event.url || process.env.SCREENSHOT_URL
  const s3Bucket = event.s3Bucket || process.env.S3_BUCKET
  const s3Key = event.s3Key || process.env.S3_KEY

  if (!url) {
    throw new Error('Missing url: provide in event or set SCREENSHOT_URL env var')
  }
  if (!s3Bucket) {
    throw new Error('Missing s3Bucket: provide in event or set S3_BUCKET env var')
  }
  if (!s3Key) {
    throw new Error('Missing s3Key: provide in event or set S3_KEY env var')
  }

  return {
    url,
    s3Bucket,
    s3Key,
    width: event.width || (process.env.VIEWPORT_WIDTH ? parseInt(process.env.VIEWPORT_WIDTH, 10) : undefined),
    height: event.height || (process.env.VIEWPORT_HEIGHT ? parseInt(process.env.VIEWPORT_HEIGHT, 10) : undefined),
    waitForSelector: event.waitForSelector || process.env.WAIT_FOR_SELECTOR,
    waitForFunction: event.waitForFunction || process.env.WAIT_FOR_FUNCTION,
    waitForTimeout: event.waitForTimeout || (process.env.WAIT_FOR_TIMEOUT ? parseInt(process.env.WAIT_FOR_TIMEOUT, 10) : undefined),
    quality: event.quality || (process.env.SCREENSHOT_QUALITY ? parseInt(process.env.SCREENSHOT_QUALITY, 10) : undefined),
    timezone: event.timezone || process.env.TIMEZONE,
  }
}

export async function handler(event: LambdaEvent = {}): Promise<LambdaResult> {
  console.log('og-lambda: starting screenshot', { event })

  try {
    const config = getConfig(event)
    console.log('og-lambda: config', {
      url: config.url,
      s3Bucket: config.s3Bucket,
      s3Key: config.s3Key,
      width: config.width,
      height: config.height,
    })

    const { buffer, contentType } = await takeScreenshot({
      url: config.url,
      width: config.width,
      height: config.height,
      waitForSelector: config.waitForSelector,
      waitForFunction: config.waitForFunction,
      waitForTimeout: config.waitForTimeout,
      quality: config.quality,
      timezone: config.timezone,
    })

    console.log('og-lambda: screenshot taken', { size: buffer.length, contentType })

    const s3 = new S3Client({})
    await s3.send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: config.s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=3600',
    }))

    const s3Uri = `s3://${config.s3Bucket}/${config.s3Key}`
    console.log('og-lambda: uploaded to S3', { s3Uri })

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Screenshot uploaded successfully',
        s3Uri,
        size: buffer.length,
      }),
      s3Uri,
    }
  } catch (error) {
    console.error('og-lambda: error', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Screenshot failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    }
  }
}
