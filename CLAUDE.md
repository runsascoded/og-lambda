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

## Configuration

The CLI supports `.og-lambda.json` or `og-lambda.config.json` config files (walks up directories like `.gitignore`).

Example config:
```json
{
  "stackName": "myproject-og",
  "screenshotUrl": "https://mysite.com",
  "s3Bucket": "my-bucket",
  "s3Key": "og-image.jpg",
  "waitForSelector": ".js-plotly-plot",
  "waitForFunction": "window.chartReady"
}
```

Environment variables override config file values. See `og-lambda config` for resolved values.
