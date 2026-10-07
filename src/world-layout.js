import * as THREE from "three";

// A single rounded footprint has no overlapping coplanar terrain tiles.
export function roundedIslandGeometry(
  width,
  depth,
  radius,
  height,
  canal = true,
) {
  const x = -width / 2,
    z = -depth / 2,
    r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, z);
  shape.lineTo(x + width - r, z);
  shape.quadraticCurveTo(x + width, z, x + width, z + r);
  shape.lineTo(x + width, z + depth - r);
  shape.quadraticCurveTo(x + width, z + depth, x + width - r, z + depth);
  shape.lineTo(x + r, z + depth);
  shape.quadraticCurveTo(x, z + depth, x, z + depth - r);
  shape.lineTo(x, z + r);
  shape.quadraticCurveTo(x, z, x + r, z);
  // The original canal and its two footbridges remain in the town center.
  if (canal) {
    const channel = new THREE.Path();
    channel.moveTo(-4.42, -5.7);
    channel.lineTo(-4.42, 5.7);
    channel.lineTo(-3.58, 5.7);
    channel.lineTo(-3.58, -5.7);
    channel.closePath();
    shape.holes.push(channel);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// Tessellate the union of road rectangles. Each patch of road is drawn once,
// including intersections, so identical-height slabs cannot fight for depth.
export function roadSurfaceGeometry(rectangles, y = 0.405) {
  const xs = [...new Set(rectangles.flatMap((r) => [r.minX, r.maxX]))].sort(
    (a, b) => a - b,
  );
  const zs = [...new Set(rectangles.flatMap((r) => [r.minZ, r.maxZ]))].sort(
    (a, b) => a - b,
  );
  const positions = [];
  const cells = [];
  for (let xi = 0; xi < xs.length - 1; xi++)
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const x0 = xs[xi],
        x1 = xs[xi + 1],
        z0 = zs[zi],
        z1 = zs[zi + 1];
      const x = (x0 + x1) / 2,
        z = (z0 + z1) / 2;
      if (
        !rectangles.some(
          (r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ,
        )
      )
        continue;
      positions.push(
        x0,
        y,
        z0,
        x0,
        y,
        z1,
        x1,
        y,
        z1,
        x0,
        y,
        z0,
        x1,
        y,
        z1,
        x1,
        y,
        z0,
      );
      cells.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      positions.filter((_, i) => i % 3 !== 1),
      2,
    ),
  );
  geometry.computeVertexNormals();
  geometry.userData.cells = cells;
  return geometry;
}
