import * as cdk from 'aws-cdk-lib'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import type { Construct } from 'constructs'

// Public chromium Lambda Layer ARNs from shelfio/chrome-aws-lambda-layer
// https://github.com/shelfio/chrome-aws-lambda-layer
const CHROMIUM_LAYER_ARNS: Record<string, string> = {
  'us-east-1': 'arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:50',
  'us-east-2': 'arn:aws:lambda:us-east-2:764866452798:layer:chrome-aws-lambda:50',
  'us-west-1': 'arn:aws:lambda:us-west-1:764866452798:layer:chrome-aws-lambda:50',
  'us-west-2': 'arn:aws:lambda:us-west-2:764866452798:layer:chrome-aws-lambda:50',
  'eu-west-1': 'arn:aws:lambda:eu-west-1:764866452798:layer:chrome-aws-lambda:50',
  'eu-west-2': 'arn:aws:lambda:eu-west-2:764866452798:layer:chrome-aws-lambda:50',
  'eu-west-3': 'arn:aws:lambda:eu-west-3:764866452798:layer:chrome-aws-lambda:50',
  'eu-central-1': 'arn:aws:lambda:eu-central-1:764866452798:layer:chrome-aws-lambda:50',
  'ap-northeast-1': 'arn:aws:lambda:ap-northeast-1:764866452798:layer:chrome-aws-lambda:50',
  'ap-northeast-2': 'arn:aws:lambda:ap-northeast-2:764866452798:layer:chrome-aws-lambda:49',
  'ap-southeast-1': 'arn:aws:lambda:ap-southeast-1:764866452798:layer:chrome-aws-lambda:50',
  'ap-southeast-2': 'arn:aws:lambda:ap-southeast-2:764866452798:layer:chrome-aws-lambda:50',
  'sa-east-1': 'arn:aws:lambda:sa-east-1:764866452798:layer:chrome-aws-lambda:50',
}

export interface OgLambdaStackProps extends cdk.StackProps {
  /** URL to screenshot */
  screenshotUrl: string
  /** S3 bucket for the screenshot */
  s3Bucket: string
  /** S3 key (path) for the screenshot */
  s3Key: string
  /** Viewport width (default: 1200) */
  viewportWidth?: number
  /** Viewport height (default: 630) */
  viewportHeight?: number
  /** CSS selector to wait for before screenshotting */
  waitForSelector?: string
  /** JS expression that must return truthy (e.g., "window.chartReady") */
  waitForFunction?: string
  /** Additional milliseconds to wait after page load */
  waitForTimeout?: number
  /** JPEG quality 0-100 (default: 90) */
  quality?: number
  /** Timezone ID (e.g., "America/New_York") for page rendering */
  timezone?: string
  /** Schedule rate in minutes (default: 60) */
  scheduleRateMinutes?: number
  /** Lambda memory in MB (default: 2048) */
  memorySize?: number
  /** Lambda timeout in minutes (default: 2) */
  timeoutMinutes?: number
}

export class OgLambdaStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function
  public readonly scheduleRule: events.Rule

  constructor(scope: Construct, id: string, props: OgLambdaStackProps) {
    super(scope, id, props)

    const {
      screenshotUrl,
      s3Bucket,
      s3Key,
      viewportWidth = 1200,
      viewportHeight = 630,
      waitForSelector,
      waitForFunction,
      waitForTimeout,
      quality = 90,
      timezone,
      scheduleRateMinutes = 60,
      memorySize = 2048,
      timeoutMinutes = 2,
    } = props

    // IAM role for Lambda
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        S3Write: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:PutObject'],
              resources: [`arn:aws:s3:::${s3Bucket}/${s3Key}`],
            }),
          ],
        }),
      },
    })

    // Environment variables
    const environment: Record<string, string> = {
      SCREENSHOT_URL: screenshotUrl,
      S3_BUCKET: s3Bucket,
      S3_KEY: s3Key,
      VIEWPORT_WIDTH: String(viewportWidth),
      VIEWPORT_HEIGHT: String(viewportHeight),
      SCREENSHOT_QUALITY: String(quality),
    }

    if (waitForSelector) {
      environment.WAIT_FOR_SELECTOR = waitForSelector
    }
    if (waitForFunction) {
      environment.WAIT_FOR_FUNCTION = waitForFunction
    }
    if (waitForTimeout) {
      environment.WAIT_FOR_TIMEOUT = String(waitForTimeout)
    }
    if (timezone) {
      environment.TIMEZONE = timezone
    }

    // Get chromium layer for this region
    const region = cdk.Stack.of(this).region
    const chromiumLayerArn = CHROMIUM_LAYER_ARNS[region]
    if (!chromiumLayerArn) {
      throw new Error(`No chromium layer available for region ${region}. Available: ${Object.keys(CHROMIUM_LAYER_ARNS).join(', ')}`)
    }

    const chromiumLayer = lambda.LayerVersion.fromLayerVersionArn(
      this, 'ChromiumLayer', chromiumLayerArn
    )

    // Lambda function
    this.lambdaFunction = new lambda.Function(this, 'ScreenshotFunction', {
      functionName: id,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/lambda'),
      timeout: cdk.Duration.minutes(timeoutMinutes),
      memorySize,
      role: lambdaRole,
      environment,
      layers: [chromiumLayer],
      description: `og-lambda: screenshots ${screenshotUrl} every ${scheduleRateMinutes} minutes`,
    })

    // EventBridge schedule
    this.scheduleRule = new events.Rule(this, 'ScheduleRule', {
      ruleName: `${id}-schedule`,
      description: `Trigger og-lambda every ${scheduleRateMinutes} minutes`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(scheduleRateMinutes)),
      enabled: true,
    })

    this.scheduleRule.addTarget(new targets.LambdaFunction(this.lambdaFunction))

    // Outputs
    new cdk.CfnOutput(this, 'LambdaArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
    })

    new cdk.CfnOutput(this, 'S3Uri', {
      value: `s3://${s3Bucket}/${s3Key}`,
      description: 'S3 URI for the screenshot',
    })

    new cdk.CfnOutput(this, 'PublicUrl', {
      value: `https://${s3Bucket}.s3.amazonaws.com/${s3Key}`,
      description: 'Public URL for the screenshot',
    })
  }
}
