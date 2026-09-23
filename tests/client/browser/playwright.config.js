import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.js',
    fullyParallel: false,
    workers: 1,
    outputDir: '../../../test-results/client',
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8791',
        viewport: { width: 1440, height: 900 },
        headless: true,
        launchOptions: {
            executablePath: process.env.CLIENT_BROWSER_PATH || '/opt/google/chrome/chrome',
            args: ['--no-sandbox'],
        },
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: `${JSON.stringify(process.execPath)} tests/client/browser/server.js`,
        cwd: '../../..',
        url: 'http://127.0.0.1:8791/client',
        reuseExistingServer: false,
    },
});
