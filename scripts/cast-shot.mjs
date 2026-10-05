// Screenshot the cast lab.  node scripts/cast-shot.mjs <out.png> "<query>" [w] [h]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const [, , out, query = "", w = "1400", h = "700"] = process.argv;
mkdirSync(dirname(out), { recursive: true });
const base = process.env.GAME_URL || "http://127.0.0.1:3500";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 600)));
await page.goto(`${base}/lab/cast.html?${query}&w=${w}&h=${h}`);
await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 90000 });
await page.screenshot({ path: out });
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 5).join("\n"));
await browser.close();
