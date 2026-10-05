// Synthesized distant thunder, unlocked by a browser gesture and opt-in only.
export function createThunderAudio(target = window) {
  let context = null,
    lastStrike = -1;
  const sources = new Set();
  const unlock = () => {
    const Audio = target.AudioContext || target.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === "suspended") context.resume().catch(() => {});
  };
  target.addEventListener("pointerdown", unlock);
  target.addEventListener("keydown", unlock);
  const stop = () => {
    for (const source of sources) {
      source.stop();
      source.onended?.();
      source.onended = null;
    }
    sources.clear();
  };
  return {
    update(weather, enabled) {
      if (!enabled || weather.weather !== "storm") {
        stop();
        lastStrike = weather.lightningId;
        return;
      }
      if (
        !context ||
        context.state !== "running" ||
        !weather.flash ||
        weather.lightningId === lastStrike
      )
        return;
      lastStrike = weather.lightningId;
      const duration = 4;
      const buffer = context.createBuffer(
        1,
        context.sampleRate * duration,
        context.sampleRate,
      );
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      const gain = context.createGain();
      const at = context.currentTime + 0.8;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.3, at + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      source.connect(filter).connect(gain).connect(context.destination);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start(at);
    },
    dispose() {
      target.removeEventListener("pointerdown", unlock);
      target.removeEventListener("keydown", unlock);
      stop();
      if (context) context.close().catch(() => {});
    },
  };
}
