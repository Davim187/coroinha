import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30000,
    testTimeout: 20000,
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://coroinha:coroinha@127.0.0.1:5433/coroinha_test',
      JWT_ACCESS_SECRET: 'test-access-secret-32-characters',
      JWT_REFRESH_SECRET: 'test-refresh-secret-32-characters',
      WEB_ORIGIN: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      BCRYPT_ROUNDS: '4',
    },
  },
})
