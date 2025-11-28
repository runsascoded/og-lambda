# og-lambda

AWS Lambda for scheduled og:image screenshot generation using Puppeteer/Chromium.

## Project Structure

- `src/` - TypeScript source for the Lambda handler and screenshot logic
  - `index.ts` - Lambda handler, exports `handler()` and `takeScreenshot()`
  - `screenshot.ts` - Puppeteer screenshot logic
  - `cli.ts` - CLI wrapper for deploy/invoke/logs
- `cdk/` - AWS CDK infrastructure
  - `stack.ts` - `OgLambdaStack` construct
  - `app.ts` - CDK app entry point
- `scripts/package.js` - esbuild bundler for Lambda deployment
- `fonts/` - Custom fonts (e.g., for emoji support)

## Build Commands

```bash
pnpm build      # Compile TypeScript (src → dist, cdk)
pnpm bundle     # Bundle Lambda with esbuild (dist/lambda/)
pnpm package    # build + bundle
pnpm synth      # Preview CloudFormation template
pnpm deploy     # Deploy to AWS
```

## Key Dependencies

- `@sparticuz/chromium` - Chromium binary for Lambda (via Lambda Layer)
- `puppeteer-core` - Browser automation
- `aws-cdk-lib` - Infrastructure as code

## Environment Variables

Required for deployment:
- `SCREENSHOT_URL` - URL to screenshot
- `S3_BUCKET` - Output bucket

Optional:
- `S3_KEY` - Output path (default: `og-image.jpg`)
- `STACK_NAME` - CloudFormation stack name
- `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` - Screenshot dimensions
- `WAIT_FOR_SELECTOR` / `WAIT_FOR_FUNCTION` / `WAIT_FOR_TIMEOUT` - Wait conditions
- `TIMEZONE` - Timezone for page rendering
