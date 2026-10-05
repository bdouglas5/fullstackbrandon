import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "brain.spec.js",
  workers: 1,
  timeout: 90000,
  outputDir: "test-results-brain",
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://localhost:49185",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=49185 PUBLIC_ORIGIN=http://localhost:49185 DATABASE_PATH=./data/brain-browser-test.sqlite TICK_MS=100 TYPESAFE_API_KEY= node server/index.js",
    url: "http://localhost:49185/api/health",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/brain-browser-results.json" }],
  ],
});
