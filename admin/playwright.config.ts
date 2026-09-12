import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {},
  },
  webServer: [{
    command: 'npm run dev -- --host 127.0.0.1 --port 3100 --strictPort',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://127.0.0.1:3100', VITE_WS_URL: 'ws://127.0.0.1:3100/ws' },
  }, {
    command: 'npm --prefix ../player run dev -- --host 127.0.0.1 --port 3101 --strictPort',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://127.0.0.1:3101', VITE_WS_URL: 'ws://127.0.0.1:3101/ws' },
  }],
});
