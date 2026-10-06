const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
const pending = new Map(),
  listeners = new Map();
let sequence = 0;
worker.onmessage = ({ data }) => {
  if (data.type === "response") {
    const waiting = pending.get(data.request);
    if (!waiting) return;
    pending.delete(data.request);
    data.error
      ? waiting.reject(new Error(data.error))
      : waiting.resolve(data.result);
  } else if (data.type === "frame") {
    for (const listener of listeners.get(data.result.id) || []) {
      listener.frame(data.result);
      listener.connection("connected");
    }
  } else if (data.type === "warning") {
    for (const waiting of pending.values())
      waiting.reject(new Error(data.error));
    pending.clear();
  }
};
worker.onerror = () => {
  for (const waiting of pending.values())
    waiting.reject(
      new Error("The island could not start. Refresh to try again."),
    );
  pending.clear();
  for (const group of listeners.values())
    for (const listener of group) listener.connection("reconnecting");
};
function rpc(message) {
  const request = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(request, { resolve, reject });
    worker.postMessage({ ...message, request });
  });
}
// A visit owns its world. Reloads resume it, independent tabs get independent
// worlds, and the next visit starts fresh without a returning-player flow.
let visit;
try {
  visit = sessionStorage.getItem("little-worlds-visit") || crypto.randomUUID();
  sessionStorage.setItem("little-worlds-visit", visit);
} catch {
  visit = crypto.randomUUID();
}
const database = `little-worlds-visit-${visit}`;
const ready = rpc({
  type: "init",
  database,
  tickMs: Number(import.meta.env.VITE_TICK_MS) || 400,
});
export async function request(path, body) {
  await ready;
  return rpc({ type: "request", path, body });
}
export function subscribe(id, frame, connection) {
  const listener = { frame, connection };
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(listener);
  ready.then(() => {
    if (listeners.get(id)?.has(listener))
      worker.postMessage({ type: "subscribe", run: id });
  });
  return () => {
    listeners.get(id)?.delete(listener);
    if (!listeners.get(id)?.size) {
      listeners.delete(id);
      worker.postMessage({ type: "unsubscribe", run: id });
    }
  };
}
function visibility() {
  worker.postMessage({ type: "visibility", visible: !document.hidden });
}
document.addEventListener("visibilitychange", visibility);
window.addEventListener("pagehide", () =>
  worker.postMessage({ type: "visibility", visible: false }),
);
// Remove only our previous visits' databases after a day. Active/reloaded
// visits are protected by the current database name.
if (indexedDB.databases)
  indexedDB
    .databases()
    .then((databases) => {
      const marker = `little-worlds-seen-${visit}`;
      const now = Date.now();
      localStorage.setItem(marker, String(now));
      for (const entry of databases) {
        if (
          !entry.name?.startsWith("little-worlds-visit-") ||
          entry.name === database
        )
          continue;
        const oldVisit = entry.name.slice("little-worlds-visit-".length);
        const key = `little-worlds-seen-${oldVisit}`;
        if (now - Number(localStorage.getItem(key) || now) > 86400000) {
          indexedDB.deleteDatabase(entry.name);
          localStorage.removeItem(key);
        }
      }
    })
    .catch(() => {});
