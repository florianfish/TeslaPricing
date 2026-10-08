import { defineConfig, devices } from '@playwright/test';

const PORT = 3199;

// Tests navigateur sur le build de production (npm run build au préalable) et la base de test
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Rennes centre : les stations de test les plus proches sont celles de Rennes
    geolocation: { latitude: 48.1173, longitude: -1.6778 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
