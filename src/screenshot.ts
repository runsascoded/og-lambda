import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

export interface ScreenshotOptions {
  url: string
  width?: number
  height?: number
  /** CSS selector to wait for before screenshotting */
  waitForSelector?: string
  /** JS expression that must return truthy (e.g., "window.chartReady") */
  waitForFunction?: string
  /** Additional ms to wait after other conditions are met */
  waitForTimeout?: number
  quality?: number
  fullPage?: boolean
  /** Timezone ID (e.g., "America/New_York") for page rendering */
  timezone?: string
}

export interface ScreenshotResult {
  buffer: Buffer
  contentType: 'image/png' | 'image/jpeg'
}

const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 630
const DEFAULT_QUALITY = 90

export async function takeScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult> {
  const {
    url,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    waitForSelector,
    waitForFunction,
    waitForTimeout = 0,
    quality = DEFAULT_QUALITY,
    fullPage = false,
    timezone,
  } = options

  let browser: Browser | null = null

  try {
    // Fonts are loaded automatically from /var/task/fonts/ directory
    // (bundled in the Lambda package by scripts/package.js)

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width, height },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()

    // Set dark mode preference
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'dark' }
    ])

    // Set timezone if specified
    if (timezone) {
      await page.emulateTimezone(timezone)
    }

    // Log console messages for debugging
    page.on('console', msg => {
      console.log(`PAGE LOG [${msg.type()}]: ${msg.text()}`)
    })
    page.on('pageerror', error => {
      console.log(`PAGE ERROR: ${error.message}`)
    })

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 30000 })
    }

    if (waitForFunction) {
      await page.waitForFunction(waitForFunction, { timeout: 30000 })
    }

    if (waitForTimeout > 0) {
      await new Promise(resolve => setTimeout(resolve, waitForTimeout))
    }

    const buffer = await page.screenshot({
      type: 'jpeg',
      quality,
      fullPage,
      clip: fullPage ? undefined : { x: 0, y: 0, width, height },
    }) as Buffer

    return {
      buffer,
      contentType: 'image/jpeg',
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
