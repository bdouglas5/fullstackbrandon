const browserMode = import.meta.env.VITE_BROWSER_SIMULATION === "true";
let local;
async function client() {
  return (local ??= import("./local/client.js"));
}
export async function api(path, body) {
  if (browserMode) return (await client()).request(path, body);
  const response = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-Little-Worlds": "1" }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Could not reach the island.");
  return result;
}
export function subscribe(id, onFrame, onConnection) {
  let closed = false;
  let dispose;
  if (browserMode) {
    client()
      .then((module) => {
        if (closed) return;
        dispose = module.subscribe(id, onFrame, onConnection);
      })
      .catch(() => onConnection("reconnecting"));
  } else {
    const stream = new EventSource(`/api/runs/${id}/events`);
    stream.onmessage = (event) => {
      onFrame(JSON.parse(event.data));
      onConnection("connected");
    };
    stream.onerror = () => onConnection("reconnecting");
    dispose = () => stream.close();
  }
  return () => {
    closed = true;
    dispose?.();
  };
}
export async function downloadRun(id) {
  const result = await api(`/runs/${id}/export`);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "little-worlds-run.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
