import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4092",
    channel: "chrome",
    launchOptions: { args: [] },
  },
  webServer: {
    ...base.webServer,
    command: base.webServer.command
      .replaceAll("4080", "4092")
      .replace("browser-test.sqlite", "resolution-test.sqlite")
      .replace("scripts/browser-server.js", "server/index.js"),
    url: "http://127.0.0.1:4092/api/health",
  },
  testMatch: ["adaptive-resolution.spec.js"],
  reporter: [["list"]],
});
