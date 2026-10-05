export const fmt = (t) =>
  `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
