import { test, expect } from "@playwright/test";
import { installSnapshot } from "./fixtures/career.js";

async function command(page, type, value) {
  return page.evaluate(
    async ({ type, value }) => {
      const { run } = await fetch("/api/session").then((r) => r.json());
      const response = await fetch(`/api/runs/${run.id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Little-Worlds": "1" },
        body: JSON.stringify({ type, value }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    { type, value },
  );
}

test("miniature lens survives full zoom and aircraft route follows its elevation", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installSnapshot(context, "helicopter");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-tilt-shift", "always-on", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-antialias-samples", /^[1-4]$/);
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-distance")))
    .toBeGreaterThan(6);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.wheel(0, -9000);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-distance")))
    .toBeLessThan(6.05);
  await expect(canvas).toHaveAttribute("data-tilt-shift", "always-on");
  const route = await canvas.evaluate((el) => ({
    start: JSON.parse(el.dataset.routeStart),
    actor: JSON.parse(el.dataset.routePosition),
    points: JSON.parse(el.dataset.routePoints),
  }));
  expect(route.start).toEqual(route.actor);
  await expect(canvas).toHaveAttribute("data-route-style", "flowing");
  expect(Number(await canvas.getAttribute("data-route-width"))).toBeGreaterThan(
    3,
  );
  expect(route.points.some((p) => p[1] > 1)).toBe(true);
  await page.screenshot({ path: "evidence/miniature-helicopter-close.png" });
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-distance")))
    .toBeGreaterThan(20);
  await expect(canvas).toHaveAttribute("data-tilt-shift", "always-on");
  await page.screenshot({ path: "evidence/miniature-overview.png" });
  expect(errors).toEqual([]);
});

test("actual customer delivery changes blue notice to green and removes it while paused", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  await expect(page.locator(".order-bubble.is-pending").first()).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeEnabled();
  const blue = await page
    .locator(".order-bubble.is-pending")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.screenshot({ path: "evidence/order-request-blue.png" });
  await command(page, "start");
  await command(page, "speed", 8);
  // Observe and pause in the same browser task, before the short-lived notice
  // can disappear between separate Playwright round trips on a busy machine.
  const observed = await page.evaluate(async (blue) => {
    const { run } = await fetch("/api/session").then((r) => r.json());
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) {
      const delivered = document.querySelector(".order-bubble.is-fulfilled");
      if (delivered && getComputedStyle(delivered).backgroundColor !== blue) {
        const id = delivered.dataset.orderId;
        const status = delivered.dataset.orderStatus;
        const color = getComputedStyle(delivered).backgroundColor;
        const response = await fetch(`/api/runs/${run.id}/command`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Little-Worlds": "1",
          },
          body: JSON.stringify({ type: "pause" }),
        });
        if (!response.ok) throw new Error(await response.text());
        return { id, status, color };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error("No fulfilled delivery notice appeared");
  }, blue);
  const { id } = observed;
  expect(observed.status).toBe("fulfilled");
  expect(observed.color).not.toBe(blue);
  const exact = page.locator(`.order-bubble[data-order-id="${id}"]`);
  const run = await page.evaluate(() =>
    fetch("/api/session").then((r) => r.json()),
  );
  expect(run.run.state.status).toBe("paused");
  expect(
    run.run.state.customerHistory.some(
      (order) => order.id === id && Number.isFinite(order.servedAt),
    ),
  ).toBe(true);
  expect(run.run.state.customerQueue.some((order) => order.id === id)).toBe(
    false,
  );
  await page.screenshot({ path: "evidence/order-delivered-green.png" });
  await expect(exact).toHaveCount(0, { timeout: 5000 });
  await page.screenshot({ path: "evidence/order-delivered-cleared.png" });
  expect(errors).toEqual([]);
});

test("UI gestures cannot zoom the page, ordinary scrolling and scene zoom remain available", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-camera-distance", /[0-9]/, {
    timeout: 30000,
  });
  const zoom = await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .evaluate((button) => {
      const sendWheel = (ctrlKey) => {
        const event = new WheelEvent("wheel", {
          deltaY: -100,
          ctrlKey,
          bubbles: true,
          cancelable: true,
        });
        button.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const gesture = new Event("gesturechange", {
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(gesture);
      const key = new KeyboardEvent("keydown", {
        key: "+",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(key);
      return {
        pinch: sendWheel(true),
        scroll: sendWheel(false),
        gesture: gesture.defaultPrevented,
        key: key.defaultPrevented,
      };
    });
  expect(zoom).toEqual({
    pinch: true,
    scroll: false,
    gesture: true,
    key: true,
  });
  const before = Number(await canvas.getAttribute("data-camera-distance"));
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.wheel(0, -500);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-distance")))
    .toBeLessThan(before - 1);
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
});

test("whole-world camera pans with WASD and arrows while orbit, reset, and follow remain usable", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-camera-target", /\[/, {
    timeout: 30000,
  });
  const pose = () =>
    canvas.evaluate((el) => ({
      target: JSON.parse(el.dataset.cameraTarget),
      position: JSON.parse(el.dataset.cameraPosition),
    }));
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  await page.getByRole("button", { name: /See the whole world/ }).click();
  const initial = await pose();
  for (const key of [
    "w",
    "a",
    "s",
    "d",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]) {
    const before = await pose();
    await page.keyboard.down(key);
    await expect
      .poll(async () => distance((await pose()).target, before.target))
      .toBeGreaterThan(0.4);
    await page.keyboard.up(key);
    await expect
      .poll(
        async () => Number(await canvas.getAttribute("data-camera-pan-speed")),
        { timeout: 15000 },
      )
      .toBeLessThan(0.01);
    const after = await pose();
    expect(distance(after.position, after.target)).toBeCloseTo(
      distance(before.position, before.target),
      3,
    );
    expect(after.target[1]).toBeCloseTo(before.target[1], 4);
    expect(distance(after.position, before.position)).toBeCloseTo(
      distance(after.target, before.target),
      3,
    );
  }
  // The eased release settles; losing focus cancels momentum immediately.
  const released = await pose();
  await page.waitForTimeout(250);
  expect(distance((await pose()).target, released.target)).toBeLessThan(0.01);
  await page.keyboard.down("w");
  await expect
    .poll(async () => distance((await pose()).target, released.target))
    .toBeGreaterThan(0.4);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const blurred = await pose();
  await page.waitForTimeout(250);
  expect(distance((await pose()).target, blurred.target)).toBeLessThan(0.01);
  await page.keyboard.up("w");
  // An editable field retains its typing and arrow-key behavior.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "camera-typing-check";
    document.body.append(input);
    input.focus();
  });
  const editing = await pose();
  await page.keyboard.type("wasd");
  await page.keyboard.press("ArrowLeft");
  expect(await page.locator("#camera-typing-check").inputValue()).toBe("wasd");
  expect(distance((await pose()).target, editing.target)).toBeLessThan(0.01);
  await page.locator("#camera-typing-check").evaluate((el) => el.remove());
  const box = await canvas.boundingBox();
  const beforeOrbit = await pose();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () => distance((await pose()).position, beforeOrbit.position))
    .toBeGreaterThan(1);
  expect(distance((await pose()).target, beforeOrbit.target)).toBeLessThan(
    0.01,
  );
  await page.screenshot({ path: "evidence/keyboard-world-camera.png" });
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect
    .poll(async () => distance((await pose()).target, initial.target))
    .toBeLessThan(0.01);
  await page.getByRole("button", { name: /Follow Brandon/ }).click();
  await expect(
    page.getByRole("button", { name: /See the whole world/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => distance((await pose()).target, initial.target))
    .toBeGreaterThan(0.5);
  const following = await pose();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowUp");
  expect(distance((await pose()).target, following.target)).toBeLessThan(0.1);
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Follow Brandon/ }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => distance((await pose()).target, initial.target))
    .toBeLessThan(0.01);
  expect(errors).toEqual([]);
});
