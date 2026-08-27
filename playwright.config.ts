import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  /// Fail the build on CI if a test.only was left in the source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    actionTimeout: 0,
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry'
  },

  /// The Cmajor host embeds a Chromium-based webview, so Chromium is the only engine to test.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],

  webServer: {
    /**
     * The production build ships no page of its own - it is a module the host loads - so only the
     * dev server, with its mock patch connection, serves something these tests can visit.
     */
    command: 'vite dev',
    port: 5173,
    reuseExistingServer: !process.env.CI
  }
})
