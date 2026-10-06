import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "portfolio-browser.spec.js",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:4200",
    viewport: { width: 1280, height: 800 },
    // CI uses software rendering. Keep the same layout and assertions while
    // reducing GPU pixel work; these are functional checks, not FPS benchmarks.
    deviceScaleFactor: process.env.CI ? 0.5 : 1,
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
    command: "npx vite preview --host 127.0.0.1 --port 4200 --strictPort",
    url: "http://127.0.0.1:4200",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/portfolio-browser-results.json" }],
  ],
});
