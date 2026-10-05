import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Heavy scene imports and other local verification can delay startup. Readiness
// has a bounded budget, and each health request has a deadline.
export async function waitForServer(child, base, output, label = "Server") {
  const deadline = Date.now() + 45000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `${label} exited before readiness: ${output() || child.exitCode || child.signalCode}`,
      );
    try {
      if (
        (
          await fetch(base + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `${label} did not become ready within 45 seconds: ${output() || lastError?.message || "no startup output"}`,
  );
}

// Choose a free loopback port so independent verification runs can coexist.
export async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
