import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @coroinha/api dev', url: 'http://127.0.0.1:3333/api/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @coroinha/web dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
})
