# @rdub/og-lambda

Scheduled AWS Lambda for generating og:image screenshots. Takes a screenshot of a URL on a schedule and uploads it to S3.

## Installation

```bash
pnpm add @rdub/og-lambda
```

## Usage

### As a standalone Lambda

Deploy using CDK with environment variables:

```bash
export SCREENSHOT_URL="https://your-site.com"
export S3_BUCKET="your-bucket"
export S3_KEY="og-image.jpg"
export STACK_NAME="your-site-og"

pnpm deploy
```

### Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `SCREENSHOT_URL` | Yes | - | URL to screenshot |
| `S3_BUCKET` | Yes | - | S3 bucket for output |
| `S3_KEY` | No | `og-image.jpg` | S3 key (path) for output |
| `STACK_NAME` | No | `og-lambda` | CloudFormation stack name |
| `VIEWPORT_WIDTH` | No | `1200` | Screenshot width |
| `VIEWPORT_HEIGHT` | No | `630` | Screenshot height |
| `WAIT_FOR_SELECTOR` | No | - | CSS selector to wait for |
| `WAIT_FOR_TIMEOUT` | No | - | Extra ms to wait after load |
| `SCREENSHOT_QUALITY` | No | `90` | JPEG quality (0-100) |
| `SCHEDULE_RATE_MINUTES` | No | `60` | How often to run |
| `LAMBDA_MEMORY` | No | `2048` | Lambda memory in MB |
| `LAMBDA_TIMEOUT_MINUTES` | No | `2` | Lambda timeout |

### Using the screenshot function directly

```typescript
import { takeScreenshot } from '@rdub/og-lambda'

const { buffer, contentType } = await takeScreenshot({
  url: 'https://example.com',
  width: 1200,
  height: 630,
})
```

## How it works

1. EventBridge triggers the Lambda on a schedule (default: hourly)
2. Lambda launches headless Chrome via `@sparticuz/chromium`
3. Takes a screenshot of the configured URL
4. Uploads the JPEG to S3 with public caching headers
5. Your site's `<meta property="og:image">` points to the S3 URL

## Requirements

- Node.js 20+
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS credentials configured
- S3 bucket with appropriate permissions

## Architecture

```
EventBridge (hourly) → Lambda → Puppeteer/Chrome → S3 bucket
                                                      ↓
                        Your site ← og:image URL ← Public URL
```

## Development

```bash
pnpm install
pnpm build        # Compile TypeScript
pnpm package      # Bundle for Lambda
pnpm synth        # Preview CloudFormation
pnpm deploy       # Deploy to AWS
```
