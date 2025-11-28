export interface ScreenshotOptions {
    url: string;
    width?: number;
    height?: number;
    /** CSS selector to wait for before screenshotting */
    waitForSelector?: string;
    /** JS expression that must return truthy (e.g., "window.chartReady") */
    waitForFunction?: string;
    /** Additional ms to wait after other conditions are met */
    waitForTimeout?: number;
    quality?: number;
    fullPage?: boolean;
    /** Timezone ID (e.g., "America/New_York") for page rendering */
    timezone?: string;
}
export interface ScreenshotResult {
    buffer: Buffer;
    contentType: 'image/png' | 'image/jpeg';
}
export declare function takeScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult>;
//# sourceMappingURL=screenshot.d.ts.map