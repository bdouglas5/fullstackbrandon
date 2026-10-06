const operation = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const complete = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () =>
      reject(tx.error || new Error("Local save was interrupted."));
  });
export async function openStorage(name) {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore("worlds", { keyPath: "id" });
    db.createObjectStore("frames", { keyPath: ["run", "tick"] });
    db.createObjectStore("meta");
  };
  const db = await operation(opening);
  return {
    async load() {
      const tx = db.transaction(["worlds", "frames", "meta"], "readonly");
      const [records, frames, meta] = await Promise.all([
        operation(tx.objectStore("worlds").getAll()),
        operation(tx.objectStore("frames").getAll()),
        operation(tx.objectStore("meta").get("current")),
      ]);
      for (const record of records) {
        record.frames = new Map();
        record.checkpoints = new Map(record.checkpoints);
      }
      for (const frame of frames)
        records
          .find((record) => record.id === frame.run)
          ?.frames.set(frame.tick, frame.state);
      return { records, ...(meta || {}) };
    },
    async save(world) {
      const tx = db.transaction(["worlds", "frames", "meta"], "readwrite");
      const finished = complete(tx);
      const worlds = tx.objectStore("worlds"),
        frames = tx.objectStore("frames");
      for (const id of world.dirty) {
        const record = world.records.get(id);
        if (record)
          worlds.put({
            id,
            state: record.state,
            parent: record.parent,
            checkpoints: [...record.checkpoints],
          });
      }
      for (const frame of world.pendingFrames.values()) frames.put(frame);
      for (const key of world.deletedFrames) frames.delete(key);
      for (const id of world.deletedRuns || []) {
        worlds.delete(id);
        const cursor = frames.openCursor(
          IDBKeyRange.bound([id, -Infinity], [id, Infinity]),
        );
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (entry) {
            entry.delete();
            entry.continue();
          }
        };
      }
      tx.objectStore("meta").put(
        { selected: world.selected, achievements: world.achievements },
        "current",
      );
      // Queue data is cloned into the transaction before clearing. New frames
      // arriving while the transaction commits remain queued for the next save.
      world.dirty.clear();
      world.pendingFrames.clear();
      world.deletedFrames.length = 0;
      world.deletedRuns.length = 0;
      await finished;
    },
  };
}
