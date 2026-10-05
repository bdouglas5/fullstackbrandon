import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const useDefaultGraphics = process.env.WEBGL_MODE === "default";
const browser = await chromium.launch({
  headless: true,
  args: useDefaultGraphics
    ? []
    : [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(process.env.GAME_URL || "http://localhost:3000");
  await page.locator("canvas").waitFor();
  await page.waitForFunction(
    () =>
      Number(document.querySelector("canvas")?.dataset.renderFrames || 0) >= 20,
  );
  const result = await page.evaluate(async () => {
    const deltas = [];
    const firstSceneFrame = Number(
      document.querySelector("canvas").dataset.renderFrames,
    );
    await new Promise((resolve) => {
      let previous = performance.now(),
        start = previous;
      function sample(now) {
        deltas.push(now - previous);
        previous = now;
        if (now - start >= 2000) resolve();
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const nav = performance.getEntriesByType("navigation")[0],
      resources = performance.getEntriesByType("resource");
    const gl = document.querySelector("canvas").getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      graphicsRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : "unavailable",
      firstSceneFrameMs: Number(
        document.querySelector("canvas").dataset.firstFrameMs,
      ),
      drawCalls: Number(document.querySelector("canvas").dataset.drawCalls),
      triangles: Number(document.querySelector("canvas").dataset.triangles),
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
      sampleDurationMs: Math.round(deltas.reduce((a, b) => a + b, 0)),
      sampleFrames: deltas.length,
      renderedSceneFrames:
        Number(document.querySelector("canvas").dataset.renderFrames) -
        firstSceneFrame,
      meanAnimationFrameIntervalMs: Number(
        (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2),
      ),
      transferredResourceBytes: resources.reduce(
        (n, r) => n + r.transferSize,
        0,
      ),
      resources: resources.map((r) => ({
        url: r.name.replace(location.origin, ""),
        encodedBytes: r.encodedBodySize,
        decodedBytes: r.decodedBodySize,
      })),
    };
  });
  writeFileSync(
    useDefaultGraphics
      ? "evidence/local-browser-default-performance.json"
      : "evidence/local-performance.json",
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        environment: useDefaultGraphics
          ? "Local production build; headless Chromium with its default graphics selection. This is a short local measurement, not a real-device or sustained performance guarantee."
          : "Local production build; headless Chromium with software WebGL (SwiftShader). Animation-frame cadence is not a GPU frame-time or real-device guarantee.",
        ...result,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      loadMs: result.loadMs,
      meanAnimationFrameIntervalMs: result.meanAnimationFrameIntervalMs,
      transferredResourceBytes: result.transferredResourceBytes,
    }),
  );
} finally {
  await browser.close();
}
