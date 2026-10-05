import base from "./playwright.config.js";
process.env.LW_ZOMBIE_TEST_DATABASE = "data/zombie-browser-test.sqlite";
export default {
  ...base,
  testMatch: ["zombies.spec.js"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4185" },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=4185 PUBLIC_ORIGIN=http://127.0.0.1:4185 DATABASE_PATH=./data/zombie-browser-test.sqlite TICK_MS=100 node server/index.js",
    url: "http://127.0.0.1:4185/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
};
