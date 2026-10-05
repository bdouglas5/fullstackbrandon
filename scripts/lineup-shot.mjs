// node scripts/lineup-shot.mjs out.png "items=van,bike&view=three" [width] [height]
import { chromium } from "@playwright/test";

const [, , out, query = "", w = "1500", h = "700"] = process.argv;
const base = process.env.GAME_URL || "http://127.0.0.1:3300";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/403|Forbidden|favicon/.test(m.text()))
    errors.push(m.text().slice(0, 800));
});
await page.goto(`${base}/lab/lineup.html?${query}`);
try {
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, {
    timeout: 90000,
  });
} catch (e) {
  console.log("TIMEOUT", errors.join("\n"));
}
await page.screenshot({ path: out });
if (errors.length)
  console.log("ERRORS:\n" + errors.slice(0, 5).join("\n---\n"));
await browser.close();
