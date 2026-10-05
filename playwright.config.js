import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "zombies.spec.js",
    "island-routine.spec.js",
    "achievements.spec.js",
    "browser.spec.js",
    "onboarding.spec.js",
    "miniature.spec.js",
    "visual-polish.spec.js",
    "realism.spec.js",
  ],
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:4080",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=4080 PUBLIC_ORIGIN=http://127.0.0.1:4080 DATABASE_PATH=./data/browser-test.sqlite TICK_MS=100 node scripts/browser-server.js",
    url: "http://127.0.0.1:4080/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/browser-results.json" }],
  ],
});
