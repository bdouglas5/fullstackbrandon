import { test, expect } from "@playwright/test";
import { installState } from "./fixtures/career.js";
import { fresh, begin, step, NODES } from "../shared/engine.js";

test("shoreline plastic is visible, hover explains it, and Brandon performs a real pickup", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  page.on("requestfailed", (r) =>
    console.error("Request failed", r.url(), r.failure()),
  );
  const s = fresh(42);
  s.status = "running";
  s.brandon.node = "garden";
  s.brandon.position = [...NODES.garden];
  begin(s, "salvage");
  for (let i = 0; i < 100 && s.brandon.buildingVisit?.phase !== "inside"; i++)
    step(s);
  s.status = "ready";
  await installState(context, s);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Close introduction", exact: true })
    .click();
  const canvas = page.locator(".island-canvas canvas");
  await expect(canvas).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  const marker = page.getByRole("button", {
    name: "Shoreline cleanup",
    exact: true,
  });
  await marker.click();
  await expect
    .poll(
      async () =>
        JSON.parse(await canvas.getAttribute("data-camera-target"))[0],
    )
    .toBe(-10.55);
  await expect(
    page.getByRole("region", { name: "Shoreline cleanup details" }),
  ).toBeVisible();
  await expect(page.locator("#shoreline-info")).toContainText(
    "washed-up bottles",
  );
  await expect(canvas).toHaveAttribute("data-shoreline-pickup", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-shoreline-phase", "inside");
  await page.screenshot({ path: "evidence/shoreline/collecting-plastic.png" });
  await expect
    .poll(
      async () =>
        page.evaluate(
          async () =>
            (await (await fetch("/api/session")).json()).run.state
              .shorelineCleaned,
        ),
      { timeout: 30000 },
    )
    .toBe(6);
  await expect(page.locator("#shoreline-info")).toContainText("6 pieces");
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await marker.hover();
  await expect(page.locator("#shoreline-info")).toBeVisible();
  expect(errors).toEqual([]);
});
