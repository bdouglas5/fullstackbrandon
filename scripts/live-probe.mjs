// Live smoothness probe: drives the real server in headless Chrome and records
// per-frame positions of Brandon, vehicles, crew and the camera.
// usage: node scripts/live-probe.mjs [url] [speed] [seconds]
import { chromium } from "@playwright/test";
const url = process.argv[2] || "http://localhost:3000", speed = Number(process.argv[3] || 1), seconds = Number(process.argv[4] || 30);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("little-worlds:intro:v1", "seen"));
await context.route("**/src/Island.jsx*", async (route) => {
  const res = await route.fetch(); const src = await res.text();
  await route.fulfill({ response: res, body: src.replace("scene.add(w.world);", "scene.add(w.world); window.__lw = { camera, controls, w, scene, controller, renderer };").replace("const actor = s.brandon;", "const actor = s.brandon; window.__dbg = { s, actor, shown: motionFor(\"brandon\").shownTick };") });
});
const page = await context.newPage();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAVIGATED", f.url()); });
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log("CONSOLE", m.type(), m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(url);
await page.waitForFunction(() => window.__lw && Number(document.querySelector("canvas")?.dataset.renderFrames) > 30, null, { timeout: 90000 });
const made = await page.evaluate(() => fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json", "x-little-worlds": "1" }, body: JSON.stringify({ controller: "rules", seed: 42 }) }).then((r) => r.json()));
const id = made.id || made.run?.id;
await page.goto(url);
await page.waitForFunction(() => window.__lw && Number(document.querySelector("canvas")?.dataset.renderFrames) > 30, null, { timeout: 90000 });
const run = made;
const cmd = (type, value) => page.evaluate(([id, type, value]) => fetch(`/api/runs/${id}/command`, { method: "POST", headers: { "content-type": "application/json", "x-little-worlds": "1" }, body: JSON.stringify({ type, value }) }).then((r) => r.json()), [id, type, value]);
console.log("run", id, "status", Object.keys(made).join(","));
await cmd("start"); await cmd("speed", speed);
await page.waitForTimeout(3000);
if (process.env.FOLLOW) {
  for (let i = 0; i < 40; i++) {
    const pt = await page.evaluate(() => { const { camera, w } = window.__lw; if (!w.brandon.visible) return null; const v = w.brandon.position.clone(); v.y += 0.8; v.project(camera); const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }; });
    if (pt) { await page.mouse.click(pt.x, pt.y); break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
}
const result = await page.evaluate(async (seconds) => {
  const { camera, w } = window.__lw;
  const names = ["brandon", "bike", "van", "rocketSkates"];
  const samples = []; let last = performance.now(); const t0 = last;
  await new Promise((done) => { const tick = (now) => {
    const dsx = document.querySelector('canvas').dataset; const proj = (o) => { if (!o?.visible) return null; const v = o.position.clone(); v.project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }; const row = { scr: proj(w.brandon), shown: window.__dbg?.shown, tick: window.__dbg?.s.tick, gap: now - last, cam: camera.position.toArray(), ctx: `${dsx.building === 'true' ? 'B' : '-'}${w.brandon.visible ? 'p' : '-'}${w.rider.visible ? 'r' : '-'}${w.driver.visible ? 'd' : '-'} lag${dsx.liveLag} t${window.__dbg?.s.tick} ${window.__dbg?.actor.mountedMode || 'foot'}${window.__dbg?.actor.transition ? '*' : ''} bikeloc=${JSON.stringify(window.__dbg?.s.vehicleLocations?.bike?.position)} pose=${dsx.brandonPose} act=${window.__dbg?.actor.action} ${dsx.deliveryVisit || ''} ${dsx.combatPhase}` };
    for (const n of names) if (w[n]?.visible) row[n] = w[n].position.toArray();
    samples.push(row); last = now; now - t0 < seconds * 1000 ? requestAnimationFrame(tick) : done(); }; requestAnimationFrame(tick); });
  return samples;
}, seconds);
const gaps = result.map((r) => r.gap).slice(1).sort((a, b) => a - b);
const p = (q) => +gaps[Math.floor(gaps.length * q)].toFixed(1);
const hitches = []; let tt = 0; result.forEach((r) => { tt += r.gap; if (r.gap > 40) hitches.push(`${(tt / 1000).toFixed(1)}s:${r.gap.toFixed(0)}ms`); });
const sj = []; result.forEach((r, i) => { if (i && r.shown !== undefined && Math.abs(r.shown - result[i - 1].shown) > 2.5 * Math.max(1, speed) * Math.max(r.gap, 8) / 400 + 1.5) sj.push(`#${i} shown ${result[i - 1].shown?.toFixed(1)}->${r.shown?.toFixed(1)} tick ${result[i - 1].tick}->${r.tick} gap ${r.gap.toFixed(0)} ${r.ctx}`); });
{ // screen-space smoothness of Brandon: second difference in px
  let worst = [], n = 0;
  for (let i = 2; i < result.length; i++) { const a = result[i - 2].scr, b = result[i - 1].scr, c = result[i].scr; if (!a || !b || !c) continue; n++; const ax = c[0] - 2 * b[0] + a[0], ay = c[1] - 2 * b[1] + a[1]; const acc = Math.hypot(ax, ay) * (16.7 / Math.max(8, result[i].gap)) ** 2; if (acc > 6) worst.push(`#${i} ${acc.toFixed(1)}px ${result[i].ctx.slice(0, 40)}`); }
  console.log(`screen-space accel spikes >6px: ${worst.length}/${n}`, worst.slice(0, 5).join(" | ")); }
console.log("shownTick jumps", sj.length, sj.slice(0, 6).join("\n  "));
console.log("hitches", hitches.join(" "));
console.log(`frames ${result.length} median ${p(0.5)}ms p95 ${p(0.95)}ms p99 ${p(0.99)}ms max ${gaps.at(-1).toFixed(1)}ms, >50ms: ${gaps.filter((g) => g > 50).length}, >100ms: ${gaps.filter((g) => g > 100).length}`);
// Per-channel step per frame normalised to a 60 Hz frame; a pop is a step far above the neighbours.
const report = {};
for (const ch of ["cam", "brandon", "bike", "van"]) {
  let prev = null, steps = [];
  result.forEach((r, i) => { const q = r[ch]; if (q && prev && result[i - 1][ch]) steps.push({ i, d: Math.hypot(q[0] - prev[0], q[2] - prev[2]) * (16.7 / Math.max(8, r.gap)) }); prev = q; });
  const pops = steps.filter((s, k) => k > 2 && s.d > 0.25 && s.d > 3 * Math.max(0.02, (steps[k - 1].d + steps[k - 2].d) / 2));
  report[ch] = { frames: steps.length, maxStep: +Math.max(0, ...steps.map((s) => s.d)).toFixed(3), pops: pops.length, first: pops.slice(0, 8).map((p) => `${(result.slice(0, p.i).reduce((a, r) => a + r.gap, 0) / 1000).toFixed(1)}s d=${p.d.toFixed(2)} ${result[p.i - 1].ctx} -> ${result[p.i].ctx}`) };
}
console.log(JSON.stringify(report));
await browser.close();
