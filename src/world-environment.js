// Repeatable weather layouts keep the world stable across renderer remounts.
export function environmentRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloudLayout(count = 19) {
  const random = environmentRandom(83147);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    let x, z;
    for (let attempt = 0; attempt < 40; attempt++) {
      x = -42 + random() * 96;
      z = -43 + random() * 84;
      if (clouds.every((c) => Math.hypot(c.x - x, c.z - z) > 8)) break;
    }
    const size = 0.75 + random() * 1.1;
    const puffs = Array.from({ length: 4 + Math.floor(random() * 6) }, () => ({
      x: (random() - 0.5) * 3.2,
      y: random() * 0.55,
      z: (random() - 0.5) * 1.65,
      scale: [
        0.65 + random() * 0.85,
        0.4 + random() * 0.4,
        0.5 + random() * 0.6,
      ],
    }));
    clouds.push({
      x,
      z,
      y: 8 + random() * 7,
      size,
      puffs,
      rotation: random() * Math.PI * 2,
      phase: random() * Math.PI * 2,
      speed: 0.009 + random() * 0.015,
    });
  }
  return clouds;
}
