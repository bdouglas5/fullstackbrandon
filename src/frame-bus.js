// Every live frame the server sends, in arrival order, independent of React.
// React batches state updates, so two frames landing close together would
// render as one and the renderer would never see the first. The scene reads
// this queue each animation frame so its playout clock gets every tick.
const queue = [];
let runId = null;
export const frameBus = {
  push(id, state) {
    if (id !== runId) {
      queue.length = 0;
      runId = id;
    }
    queue.push(state);
    if (queue.length > 240) queue.splice(0, queue.length - 240);
  },
  // Frames received since the last drain.
  drain() {
    return queue.splice(0, queue.length);
  },
  clear() {
    queue.length = 0;
  },
};
