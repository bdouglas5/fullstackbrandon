import config from "./playwright.ui-cleanup.config.js";
export default {
  ...config,
  testMatch: ["sidebar-controls.spec.js"],
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/sidebar-controls/browser-results.json" }],
  ],
};
