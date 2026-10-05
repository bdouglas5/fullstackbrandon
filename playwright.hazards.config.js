import base from "./playwright.config.js";
process.env.LW_HAZARD_TEST_DATABASE = "data/hazards-browser-test.sqlite";
export default {
  ...base,
  testMatch: ["hazards.spec.js"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4186" },
  webServer: {
    command:
      "NODE_ENV=production HOST=127.0.0.1 PORT=4186 PUBLIC_ORIGIN=http://127.0.0.1:4186 DATABASE_PATH=./data/hazards-browser-test.sqlite TICK_MS=100 node server/index.js",
    url: "http://127.0.0.1:4186/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
};
