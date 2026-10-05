import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const [,, out, title, ...cells] = process.argv; // cells: "label|path"
const items = cells.map((c) => c.split("|"));
const cols = items.length <= 3 ? items.length : 3;
const html = `<html><body style="margin:0;background:#1d2329;font-family:-apple-system,sans-serif;color:#eef">
<div style="padding:14px 18px;font-size:22px;font-weight:600">${title}</div>
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:0 10px 10px">
${items.map(([l, p]) => `<figure style="margin:0"><img src="file://${p}" style="width:100%;border-radius:8px;display:block"><figcaption style="padding:6px 2px;font-size:16px;opacity:.85">${l}</figcaption></figure>`).join("")}
</div></body></html>`;
const file = out.replace(/\.png$/, ".html");
writeFileSync(file, html);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: cols * 720, height: 600 } });
await page.goto("file://" + file);
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
