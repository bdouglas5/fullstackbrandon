import base from "./playwright.config.js";
process.env.LW_HAZARD_TEST_DATABASE = "data/stability-browser-test.sqlite";
process.env.LW_ZOMBIE_TEST_DATABASE = "data/stability-browser-test.sqlite";
export default {
  ...base,
  testMatch: ["hazards.spec.js", "island-routine.spec.js"],
  testDir: "./tests",
  outputDir: "test-results/stability",
  use: {
    ...base.use,
    channel: "chrome",
    launchOptions: { args: [] },
    baseURL: "http://127.0.0.1:4194",
    viewport: { width: 1000, height: 720 },
  },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=4194 PUBLIC_ORIGIN=http://127.0.0.1:4194 DATABASE_PATH=./data/stability-browser-test.sqlite TICK_MS=100 node server/index.js",
    url: "http://127.0.0.1:4194/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
};
