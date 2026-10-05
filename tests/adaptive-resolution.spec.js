import { test, expect } from "@playwright/test";
import { installState, careerSnapshots } from "./fixtures/career.js";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`resolution adapts without changing canvas layout or controls at ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    // Deliver real rendered frames at <=30 FPS to exercise the integration.
    await context.addInitScript(() => {
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        let first = null;
        const tick = (time) => {
          first ??= time;
          if (time - first >= 33) callback(time);
          else request(tick);
        };
        return request(tick);
      };
    });
    await installState(context, careerSnapshots("foot").foot, {
      databasePath: "data/resolution-test.sqlite",
      baseURL: "http://127.0.0.1:4092",
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Close introduction", exact: true })
      .click();
    const canvas = page.locator(".island-canvas canvas");
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute("data-resolution-scale", "1");
    const before = await canvas.evaluate((el) => ({
      width: el.width,
      cssWidth: el.clientWidth,
      cssHeight: el.clientHeight,
    }));
    await expect
      .poll(
        async () => Number(await canvas.getAttribute("data-resolution-scale")),
        { timeout: 60000 },
      )
      .toBeLessThan(1);
    await expect(page.locator(".resolution-notice")).toContainText(
      "Resolution lowered",
    );
    await expect(page.locator(".resolution-notice")).toContainText(
      "aiming for 60 FPS",
    );
    const noticeBox = await page.locator(".resolution-notice").boundingBox();
    for (const overlay of [".weather-pill", ".scene-tools"]) {
      const other = await page.locator(overlay).boundingBox();
      const overlaps =
        noticeBox.x < other.x + other.width &&
        noticeBox.x + noticeBox.width > other.x &&
        noticeBox.y < other.y + other.height &&
        noticeBox.y + noticeBox.height > other.y;
      expect(overlaps).toBe(false);
    }
    // Give the lens a frame to resize its offscreen buffers as well.
    await expect(canvas).toHaveAttribute("data-tilt-shift", "always-on");
    const after = await canvas.evaluate((el) => ({
      width: el.width,
      cssWidth: el.clientWidth,
      cssHeight: el.clientHeight,
    }));
    expect(after.width).toBeLessThan(before.width);
    expect(after.cssWidth).toEqual(before.cssWidth);
    expect(after.cssHeight).toEqual(before.cssHeight);
    await expect(canvas).toHaveAttribute("data-target-fps", "60");
    await expect(canvas).toHaveAttribute("data-frame-interval", "17");
    const distance = Number(await canvas.getAttribute("data-camera-distance"));
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(
        async () => Number(await canvas.getAttribute("data-camera-distance")),
        { timeout: 15000 },
      )
      .toBeLessThan(distance);
    const count = Number(await canvas.getAttribute("data-render-frames"));
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
      .toBeGreaterThan(count);
    await page.screenshot({
      path: `evidence/adaptive-resolution-${viewport.width}.png`,
    });
    expect(errors).toEqual([]);
  });
}
