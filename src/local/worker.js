import { BrowserWorld } from "./world.js";
import { openStorage } from "./storage.js";
let world,
  storage,
  initializing,
  visible = true,
  saving = Promise.resolve(),
  warning;
const subscriptions = new Set();
function frame(envelope) {
  if (subscriptions.has(envelope.id))
    postMessage({
      type: "frame",
      result: { ...envelope, storageWarning: warning },
    });
}
async function initialize(message) {
  try {
    storage = await openStorage(message.database);
    world = new BrowserWorld({
      ...(await storage.load()),
      tickMs: message.tickMs || 400,
    });
  } catch {
    world = new BrowserWorld({ tickMs: message.tickMs || 400 });
    warning =
      "Local saving is unavailable in this browser. You can still play, but refreshing will reset this world.";
  }
}
function flush() {
  if (!storage || !world) return Promise.resolve();
  saving = saving
    .then(() => storage.save(world))
    .catch(() => {
      storage = null;
      warning =
        "Your browser could not save this world. Keep this tab open to continue playing.";
      if (world.selected) frame(world.envelope(world.own(world.selected)));
    });
  return saving;
}
onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      initializing = initialize(data);
      await initializing;
    } else {
      await initializing;
      if (!world) throw new Error("The island is still loading.");
      if (data.type === "subscribe") {
        subscriptions.add(data.run);
        frame(world.envelope(world.own(data.run)));
        return;
      }
      if (data.type === "unsubscribe") {
        subscriptions.delete(data.run);
        return;
      }
      if (data.type === "visibility") {
        visible = data.visible;
        world.lastPump = null;
        world.credit = 0;
        if (!visible && world.selected) {
          const record = world.own(world.selected);
          if (record.state.status === "running") {
            record.state.status = "paused";
            world.saveFrame(record);
            frame(world.envelope(record));
          }
        }
        await flush();
        return;
      }
      const result = world.request(data.path, data.body);
      if (data.body) {
        frame(result);
        await flush();
      }
      postMessage({
        type: "response",
        request: data.request,
        result: Array.isArray(result)
          ? result
          : { ...result, storageWarning: warning },
      });
      // History is an array; preserve its shape rather than spreading it.
      return;
    }
    postMessage({ type: "response", request: data.request, result: true });
  } catch (error) {
    postMessage({
      type: "response",
      request: data.request,
      error: error.message,
    });
  }
};
setInterval(() => {
  if (!world || !visible || !subscriptions.size) return;
  try {
    world.pump(performance.now(), frame);
  } catch (error) {
    if (world.selected) {
      const record = world.own(world.selected);
      record.state.status = "paused";
      world.saveFrame(record);
      frame(world.envelope(record));
    }
    postMessage({ type: "warning", error: error.message });
  }
}, 50);
setInterval(flush, 500);
