// node scripts/fleet-sheet.mjs out.png "ids=bike,van&yaw=-0.6"
import { chromium } from "@playwright/test";
const [, , out, query = ""] = process.argv;
const base = process.env.GAME_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1680, height: 660 } });
page.on("pageerror", (e) => console.log("ERR", e.message));
await page.goto(`${base}/lab/fleet.html?${query}`);
await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 120000 });
await page.screenshot({ path: out });
await browser.close();
