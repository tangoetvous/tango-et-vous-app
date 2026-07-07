// Config Playwright — tests E2E sur admin.html en MODE DÉMO uniquement.
// Aucune écriture Supabase : le mode démo travaille sur DEMO_DATA en mémoire.
// Lancer :  npm test
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8788',
    headless: true,
  },
  webServer: {
    command: 'node tests/server.js',
    url: 'http://127.0.0.1:8788/admin.html',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
