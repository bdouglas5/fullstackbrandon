import config from './playwright.config.js';
export default {
  ...config,
  testMatch: ['onboarding.spec.js'],
  use: {...config.use, baseURL: 'http://127.0.0.1:4092'},
  webServer: {
    command: 'NODE_ENV=production HOST=127.0.0.1 PORT=4092 PUBLIC_ORIGIN=http://127.0.0.1:4092 DATABASE_PATH=./data/ui-cleanup-test.sqlite TICK_MS=100 node server/index.js',
    url: 'http://127.0.0.1:4092/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [['list'], ['json', {outputFile: 'evidence/ui-cleanup/browser-results.json'}]],
};
