// node scripts/toy-shot.mjs out.png "items=van&view=three&dist=4.5" [width] [height]
import { chromium } from "@playwright/test";

const [, , out, query = "", w = "1300", h = "800"] = process.argv;
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
  if (m.type() === "error" && !/403|Forbidden|favicon|404/.test(m.text()))
    errors.push(m.text().slice(0, 800));
});
await page.goto(`${base}/lab/toy.html?${query}`);
try {
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, {
    timeout: 120000,
  });
  console.log(await page.evaluate(() => document.body.dataset.stats));
} catch (e) {
  console.log("TIMEOUT");
}
await page.screenshot({ path: out });
if (errors.length)
  console.log("ERRORS:\n" + errors.slice(0, 5).join("\n---\n"));
await browser.close();
