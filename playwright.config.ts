import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    // Slow down for debugging: actionTimeout: 5000,
  },
  // Start both servers before running tests
  webServer: [
    {
      command: 'cd backend && npx tsx index.ts',
      port: 3001,
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      command: 'cd frontend && npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
});
