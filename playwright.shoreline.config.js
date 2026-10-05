import config from "./playwright.config.js";
export default {
  ...config,
  testMatch: ["shoreline.spec.js"],
  webServer: {
    ...config.webServer,
    cwd: process.env.SHORELINE_BROWSER_ROOT,
    command: config.webServer.command.replace("TICK_MS=100", "TICK_MS=800"),
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/shoreline/browser-results.json" }],
  ],
};
