import motion from "./playwright.motion.config.js";
process.env.LW_ZOMBIE_TEST_DATABASE = "data/navigation-browser-test.sqlite";
export default {
  ...motion,
  grep: /flowing route/,
  webServer: {
    ...motion.webServer,
    command: motion.webServer.command
      .replace("motion-browser-test.sqlite", "navigation-browser-test.sqlite")
      .replace("TICK_MS=100", "TICK_MS=400"),
  },
};
