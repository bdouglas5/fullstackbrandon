import base from "./playwright.config.js";
process.env.LW_ZOMBIE_TEST_DATABASE = "data/motion-browser-test.sqlite";
export default {
  ...base,
  testMatch: ["island-routine.spec.js", "zombies.spec.js"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4188" },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=4188 PUBLIC_ORIGIN=http://127.0.0.1:4188 DATABASE_PATH=./data/motion-browser-test.sqlite TICK_MS=100 node server/index.js",
    url: "http://127.0.0.1:4188/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
};
