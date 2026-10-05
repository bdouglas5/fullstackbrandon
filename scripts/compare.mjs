// Side-by-side before | after sheets: node scripts/compare.mjs <afterLabel> [names...]
import { chromium } from "@playwright/test";
import { readdirSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const after = process.argv[2] || "v5";
const names = process.argv.slice(3).length ? process.argv.slice(3) : readdirSync(`evidence/${after}`).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
mkdirSync(`evidence/compare-${after}`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 2146, height: 833 } });
for (const n of names) {
  const uri = (f) => "data:image/png;base64," + readFileSync(resolve(f)).toString("base64");
  const b = uri(`evidence/before/${n}.png`), a = uri(`evidence/${after}/${n}.png`);
  await page.setContent(`<body style="margin:0;background:#111;display:flex;font:600 20px system-ui;color:#fff">
    <div style="position:relative"><img src="${b}"><span style="position:absolute;left:14px;top:12px;background:#000a;padding:4px 10px;border-radius:6px">BEFORE</span></div>
    <div style="position:relative"><img src="${a}"><span style="position:absolute;left:14px;top:12px;background:#000a;padding:4px 10px;border-radius:6px">AFTER</span></div></body>`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: `evidence/compare-${after}/${n}.png` });
}
await browser.close();
console.log("wrote", names.length);
