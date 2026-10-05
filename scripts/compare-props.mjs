// node scripts/compare.mjs beforeLabel afterLabel name[,name...] [x,y,w,h crop]
// Writes shots/compare/<name>.png with the two frames side by side.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const [, , before, after, names, crop] = process.argv;
mkdirSync("shots/compare", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const name of names.split(",")) {
  const uri = (label) =>
    `data:image/png;base64,${readFileSync(`shots/${label}/${name}.png`).toString("base64")}`;
  const [cx, cy, cw, ch] = crop
    ? crop.split(",").map(Number)
    : [0, 0, 1073, 833];
  const page = await browser.newPage({
    viewport: { width: cw * 2 + 8, height: ch },
  });
  const view = (
    label,
  ) => `<div style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden">
    <img src="${uri(label)}" style="position:absolute;left:${-cx}px;top:${-cy}px">
    <span style="position:absolute;left:0;top:0;background:#000;color:#fff;font:12px sans-serif;padding:3px 7px">${label}</span></div>`;
  await page.setContent(
    `<body style="margin:0;background:#fff;display:flex;gap:8px">${view(before)}${view(after)}</body>`,
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: `shots/compare/${name}.png` });
  await page.close();
}
await browser.close();
