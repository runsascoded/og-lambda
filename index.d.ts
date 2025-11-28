export { takeScreenshot, type ScreenshotOptions, type ScreenshotResult } from './screenshot.js';
export interface LambdaConfig {
    url: string;
    s3Bucket: string;
    s3Key: string;
    width?: number;
    height?: number;
    waitForSelector?: string;
    waitForFunction?: string;
    waitForTimeout?: number;
    quality?: number;
    timezone?: string;
}
export interface LambdaEvent {
    url?: string;
    s3Bucket?: string;
    s3Key?: string;
    width?: number;
    height?: number;
    waitForSelector?: string;
    waitForFunction?: string;
    waitForTimeout?: number;
    quality?: number;
    timezone?: string;
}
export interface LambdaResult {
    statusCode: number;
    body: string;
    s3Uri?: string;
}
export declare function handler(event?: LambdaEvent): Promise<LambdaResult>;
//# sourceMappingURL=index.d.ts.map