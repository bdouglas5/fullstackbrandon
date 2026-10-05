import * as THREE from "three";
import { CREATURE, OIL, liveSpills } from "../shared/hazards.js";

// Visitor obstacles: the purple harbor creature (only its tentacles, ripples,
// bubbles and a shadow ever show) and the oil spills with their spin-outs.
const WATER = -0.58;
const ROAD = 0.44;
const PURPLE = "#8556c4",
  PURPLE_DEEP = "#4d2c82",
  SUCKER = "#eac3e0";
const SEGMENTS = 14;
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

// Wobbly blob outline, shared by every puddle.
function blobGeometry(wobble = 1) {
  const geometry = new THREE.CircleGeometry(1, 44);
  const p = geometry.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const a = Math.atan2(p.getY(i), p.getX(i));
    const r =
      1 +
      wobble *
        (0.17 * Math.sin(3 * a + 1.3) +
          0.1 * Math.sin(5 * a + 2.1) +
          0.05 * Math.sin(9 * a));
    p.setXYZ(i, p.getX(i) * r, p.getY(i) * r, 0);
  }
  geometry.computeVertexNormals();
  return geometry;
}
// Rainbow film that sits on top of the dark oil.
function sheenGeometry() {
  const geometry = blobGeometry(0.6);
  const p = geometry.attributes.position,
    colors = new Float32Array(p.count * 3),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getY(i), p.getX(i)),
      r = Math.hypot(p.getX(i), p.getY(i));
    c.setHSL((a / (Math.PI * 2) + r * 0.7 + 1) % 1, 0.75, 0.62);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Soft round sprite so points read as bubbles and foam, not square pixels.
function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createHazardWorld(w) {
  const dot = dotTexture();
  const root = new THREE.Group();
  root.name = "Obstacles: harbor creature and oil";
  root.userData.dynamic = true;
  w.world.add(root);

  // ------------------------------------------------------------------ oil
  const blob = blobGeometry(),
    sheen = sheenGeometry(),
    droplet = blobGeometry(0.5);
  const oilMaterial = new THREE.MeshStandardMaterial({
    color: "#16111f",
    roughness: 0.1,
    metalness: 0.45,
    transparent: true,
    opacity: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const sheenMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const puddles = Array.from({ length: OIL.max }, () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(blob, oilMaterial);
    const film = new THREE.Mesh(sheen, sheenMaterial);
    film.scale.setScalar(0.74);
    film.position.set(0.05, 0.03, 0);
    g.add(body, film);
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(droplet, oilMaterial);
      const a = 1.2 + i * 2.2;
      d.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0);
      d.scale.setScalar(0.1 + i * 0.03);
      g.add(d);
    }
    g.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(g);
    holder.visible = false;
    root.add(holder);
    return { holder, g, id: null, shown: 0 };
  });
  const foamPositions = new Float32Array(40 * 3 * OIL.max);
  const foamGeometry = new THREE.BufferGeometry();
  foamGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(foamPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const foam = new THREE.Points(
    foamGeometry,
    new THREE.PointsMaterial({
      color: "#ffffff",
      map: dot,
      size: 0.14,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  foam.frustumCulled = false;
  foam.visible = false;
  root.add(foam);
  const preview = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.9, 40),
    new THREE.MeshBasicMaterial({
      color: "#2a1d44",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  preview.rotation.x = -Math.PI / 2;
  preview.visible = false;
  preview.scale.setScalar(1);
  root.add(preview);
  const previewDisc = new THREE.Mesh(
    new THREE.CircleGeometry(OIL.radius, 32),
    new THREE.MeshBasicMaterial({
      color: "#2a1d44",
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  previewDisc.rotation.x = -Math.PI / 2;
  previewDisc.visible = false;
  root.add(previewDisc);

  // The mop hangs off Brandon's root, held out in front of him, so it never
  // depends on the figurine's bone hierarchy.
  const mop = new THREE.Group();
  mop.name = "Spill kit mop";
  mop.position.set(0.14, 0.55, 0.12);
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.62, 3, 8),
    std("#a6784a"),
  );
  handle.position.y = -0.31;
  const sponge = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.26, 3, 8),
    std("#f0cf62"),
  );
  sponge.rotation.z = Math.PI / 2;
  sponge.position.y = -0.68;
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8),
    std("#df6f55"),
  );
  stripe.position.y = -0.05;
  mop.add(handle, sponge, stripe);
  mop.rotation.x = -0.9;
  mop.visible = false;
  const bucket = new THREE.Group();
  bucket.name = "Spill kit bucket";
  bucket.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.075, 0.17, 14),
      std("#df6f55"),
    ),
  );
  const suds = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 0.02, 14),
    std("#f6fbff"),
  );
  suds.position.y = 0.075;
  bucket.add(suds);
  bucket.visible = false;
  root.add(bucket);

  // Dazed stars over anyone who just spun out.
  const stars = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: "#ffd45e" }),
      );
      g.add(star);
    }
    g.visible = false;
    root.add(g);
    return g;
  });

  // -------------------------------------------------------------- creature
  const tentacleGeometry = Array.from({ length: SEGMENTS }, (_, i) => {
    const u = i / SEGMENTS;
    const r0 = 0.15 * Math.pow(1 - u, 0.8) + 0.018,
      r1 = 0.15 * Math.pow(1 - (i + 1) / SEGMENTS, 0.8) + 0.018;
    return new THREE.CylinderGeometry(r1, r0, 1, 9);
  });
  const skin = std(PURPLE, { roughness: 0.38 });
  const skinDeep = std(PURPLE_DEEP, { roughness: 0.5 });
  const suckerMaterial = std(SUCKER, { roughness: 0.3 });
  const suckerGeometry = new THREE.SphereGeometry(0.028, 8, 6);
  const ringGeometry = new THREE.RingGeometry(0.62, 0.7, 30);
  const bubbleGeometry = new THREE.BufferGeometry();
  const BUBBLES = 36;
  const bubblePositions = new Float32Array(BUBBLES * 3);
  bubbleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(bubblePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const bubbleMaterial = new THREE.PointsMaterial({
    color: "#e8fbff",
    map: dot,
    size: 0.11,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  function makeUnit() {
    const unit = new THREE.Group();
    unit.visible = false;
    const tentacles = Array.from({ length: 5 }, (_, n) => {
      const g = new THREE.Group();
      const segs = tentacleGeometry.map((geometry, i) => {
        const m = new THREE.Mesh(geometry, i < 3 ? skinDeep : skin);
        g.add(m);
        return m;
      });
      const suckers = [];
      for (let i = 2; i < SEGMENTS - 1; i += 2) {
        const s = new THREE.Mesh(suckerGeometry, suckerMaterial);
        s.userData.seg = i;
        g.add(s);
        suckers.push(s);
      }
      unit.add(g);
      return { g, segs, suckers, seed: n * 1.7 + 0.3 };
    });
    const rings = Array.from({ length: 3 }, () => {
      const r = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: "#e2f6f8",
          transparent: true,
          depthWrite: false,
        }),
      );
      r.rotation.x = -Math.PI / 2;
      unit.add(r);
      return r;
    });
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({
        color: "#3b1e62",
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = WATER;
    unit.add(shadow);
    const bubbles = new THREE.Points(bubbleGeometry.clone(), bubbleMaterial);
    bubbles.frustumCulled = false;
    unit.add(bubbles);
    root.add(unit);
    return { unit, tentacles, rings, shadow, bubbles };
  }
  const units = Array.from({ length: 4 }, makeUnit);
  const lurker = makeUnit();

  // The state advances in discrete ticks; this interpolates between them so
  // the tentacles and spins move continuously.
  const clock = { tick: -1, at: 0, interval: 400 };
  const fractional = (s, now) => {
    if (s.tick !== clock.tick) {
      if (clock.tick >= 0 && s.tick > clock.tick)
        clock.interval = Math.max(
          60,
          Math.min(1200, (now - clock.at) / (s.tick - clock.tick)),
        );
      clock.tick = s.tick;
      clock.at = now;
    }
    return s.status === "running"
      ? s.tick + Math.min(1, (now - clock.at) / clock.interval)
      : s.tick;
  };

  function aim(unit, center, ship, g, time, tickFrac, holdTarget) {
    const R = ship ? 4.1 : 0.82,
      H = ship ? 3.6 : 1.05,
      k = ship ? 2.6 : 0.78;
    unit.unit.visible = true;
    unit.unit.position.set(center.x, 0, center.z);
    unit.tentacles.forEach((t, n) => {
      t.g.visible = g > 0.02;
      if (!t.g.visible) return;
      const theta = (n / unit.tentacles.length) * Math.PI * 2 + 0.5;
      const pts = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const u = (i / SEGMENTS) * g;
        const ang =
          theta + u * 0.7 + Math.sin(time * 2.4 + u * 6 + t.seed) * 0.11 * u;
        const rad =
          R * (1.3 - 1.08 * Math.pow(u, 1.25)) +
          Math.sin(time * 1.9 + t.seed) * 0.05;
        // Rise out of the water, then hook over the gunwale at the tip.
        const hook = smooth((u - 0.7) / 0.3);
        const y =
          -1.7 +
          (H + 1.7) * (1 - Math.pow(1 - u, 2)) -
          H * 0.34 * hook +
          Math.sin(time * 3.1 + u * 4 + t.seed * 2) * 0.1 * u;
        pts.push(
          new THREE.Vector3(
            Math.cos(ang) * rad,
            y + (center.y || 0),
            Math.sin(ang) * rad,
          ),
        );
      }
      const dir = new THREE.Vector3(),
        up = new THREE.Vector3(0, 1, 0);
      t.segs.forEach((mesh, i) => {
        dir.subVectors(pts[i + 1], pts[i]);
        const len = dir.length() || 0.001;
        mesh.position.copy(pts[i]).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(up, dir.normalize());
        mesh.scale.set(k, len, k);
      });
      t.suckers.forEach((s) => {
        const i = s.userData.seg;
        const inward = new THREE.Vector3(-pts[i].x, 0, -pts[i].z).normalize();
        const r = (0.15 * Math.pow(1 - i / SEGMENTS, 0.8) + 0.018) * k * 0.9;
        s.position.copy(pts[i]).addScaledVector(inward, r);
        s.scale.setScalar(k * (1 - (i / SEGMENTS) * 0.5));
      });
    });
    // Ripples spread from each tentacle base.
    unit.rings.forEach((ring, i) => {
      const phase = (time * 0.45 + i / 3) % 1;
      ring.position.set(0, WATER + 0.01, 0);
      ring.scale.setScalar(R * (0.7 + phase * 1.5));
      ring.material.opacity = (1 - phase) * 0.55 * Math.max(0.35, g);
    });
    unit.shadow.scale.set(R * 2.1 + Math.sin(time * 1.1) * 0.12, R * 1.5, 1);
    unit.shadow.material.opacity = 0.18 + 0.2 * Math.max(g, holdTarget);
    const p = unit.bubbles.geometry.attributes.position;
    for (let i = 0; i < BUBBLES; i++) {
      const phase = (time * 0.4 + hash(i) * 3 + i * 0.37) % 1;
      const a = hash(i + 9) * Math.PI * 2,
        rr = R * (0.2 + hash(i + 3) * 1.2);
      p.setXYZ(
        i,
        Math.cos(a) * rr + Math.sin(time * 2 + i) * 0.04,
        WATER - 0.9 + phase * 0.95,
        Math.sin(a) * rr,
      );
    }
    p.needsUpdate = true;
    unit.bubbles.visible = g > 0.05 || holdTarget > 0;
  }

  // The figurine rig can be rebuilt after this world is created, so the
  // hand and arms are looked up each frame rather than once.
  const rig = () => {
    const get = (name) => w.body.getObjectByName(name);
    if (mop.parent !== w.brandon) w.brandon.add(mop);
    return {
      left: get("left arm"),
      right: get("right arm"),
      leftElbow: get("left elbow"),
      rightElbow: get("right elbow"),
    };
  };
  const slipMotion = new Map();
  const touched = new Set();
  // Roll is set absolutely (nothing else resets it) and cleared the moment
  // an object stops slipping, so no vehicle or rider stays tilted.
  const rocked = new Set();
  const rockedNow = new Set();
  const spinVehicles = (list, angle, wobble) => {
    for (const o of list)
      if (o?.visible) {
        o.rotation.y += angle;
        o.rotation.z = wobble;
        rocked.add(o);
        rockedNow.add(o);
      }
  };
  let visualTime = 0,
    previousTime = null;

  return {
    setPreview(point) {
      preview.visible = previewDisc.visible = !!point;
      if (point) {
        preview.position.set(point.x, ROAD + 0.02, point.z);
        previewDisc.position.set(point.x, ROAD + 0.015, point.z);
      }
    },
    update(s, now, reduced) {
      const tickFrac = fractional(s, now);
      const dt =
        previousTime == null
          ? 0
          : Math.max(0, Math.min(0.1, (now - previousTime) / 1000));
      previousTime = now;
      if (s.status === "running") visualTime += dt;
      const time = reduced ? 0 : visualTime;
      const hz = s.hazards || {};

      // ---- oil puddles
      const spills = (hz.spills || []).slice(0, OIL.max);
      let foamCount = 0;
      puddles.forEach((puddle, i) => {
        const o = spills[i];
        puddle.holder.visible = !!o;
        if (!o) {
          puddle.id = null;
          return;
        }
        if (puddle.id !== o.id) {
          puddle.id = o.id;
          puddle.shown = 0;
          puddle.g.rotation.z = hash(i + o.placedAt) * 6.28;
        }
        const grow = smooth((tickFrac - o.placedAt) / 4);
        const drying = smooth((o.expiresAt - tickFrac) / 8);
        // Cleaning advances in whole ticks; interpolate between them.
        const need =
          s.tools?.spill_kit === 2 ? OIL.cleanTicks / 2 : OIL.cleanTicks;
        const progress = Math.min(
          1,
          (o.cleaning || 0) + (o.cleaning ? (tickFrac - s.tick) / need : 0),
        );
        const scrubbed = o.cleanedAt
          ? Math.max(0, 1 - (tickFrac - o.cleanedAt) / 1.5) * 0.12
          : 1 - smooth(progress);
        puddle.shown = grow * drying * scrubbed;
        const size = Math.max(0.0001, puddle.shown * OIL.radius * 0.96);
        puddle.holder.position.set(o.x, ROAD, o.z);
        puddle.g.scale.setScalar(size);
        if (o.cleaning > 0 && !o.cleanedAt)
          for (let n = 0; n < 40 && foamCount < 40 * OIL.max; n++) {
            const phase = (time * 0.9 + n * 0.37) % 1,
              a = hash(n + i * 40) * 6.28,
              r =
                Math.sqrt(hash(n + 7)) *
                OIL.radius *
                (0.4 + puddle.shown * 0.6);
            foamPositions[foamCount * 3] = o.x + Math.cos(a) * r;
            foamPositions[foamCount * 3 + 1] = ROAD + 0.04 + phase * 0.35;
            foamPositions[foamCount * 3 + 2] = o.z + Math.sin(a) * r;
            foamCount++;
          }
      });
      foam.visible = !reduced && foamCount > 0;
      foamGeometry.setDrawRange(0, foamCount);
      foamGeometry.attributes.position.needsUpdate = true;

      // ---- Brandon scrubbing
      const c = s.brandon.combat;
      const cleaning = c?.kind === "cleanup";
      const arms = rig();
      mop.visible = cleaning && c.phase === "clean";
      bucket.visible = cleaning && c.phase === "clean";
      if (cleaning) {
        const spill = (hz.spills || []).find((o) => o.id === c.spillId);
        const p = w.brandon.position;
        const side = c.heading || 0;
        bucket.position.set(
          p.x - Math.cos(side) * 0.3,
          0.5,
          p.z + Math.sin(side) * 0.3,
        );
        if (c.phase === "clean") {
          const sweep = reduced ? 0.5 : (Math.sin(time * 9) + 1) / 2;
          if (arms.left) arms.left.rotation.x = -0.85 - sweep * 0.35;
          if (arms.right) arms.right.rotation.x = -0.95 + sweep * 0.45;
          if (arms.leftElbow) arms.leftElbow.rotation.x = -0.5;
          if (arms.rightElbow)
            arms.rightElbow.rotation.x = -0.35 - sweep * 0.25;
          mop.rotation.x = -(0.85 + sweep * 0.3);
          mop.rotation.y = (sweep - 0.5) * 0.7;
          if (spill)
            w.brandon.rotation.y = Math.atan2(spill.x - p.x, spill.z - p.z);
        }
      }

      // ---- spin-outs
      const actors = [
        {
          id: "brandon",
          slip: s.brandon.slip,
          objects: [
            w.brandon,
            w.van,
            w.bike,
            w.rocketSkates,
            w.driver,
            w.rider,
          ],
        },
        ...(s.crew || []).map((member) => {
          const rig = w.crewActors?.get(member.id);
          return {
            id: member.id,
            slip: member.slip,
            objects: rig
              ? [rig.group, rig.van, rig.bicycle, rig.rocketSkates]
              : [],
          };
        }),
      ];
      stars.forEach((g) => (g.visible = false));
      rockedNow.clear();
      actors.slice(0, stars.length).forEach((actor, i) => {
        const state = slipMotion.get(actor.id) || { elapsed: -1, at: now };
        const slip = actor.slip;
        if (!slip) {
          slipMotion.delete(actor.id);
          return;
        }
        if (state.elapsed !== slip.elapsed) {
          state.elapsed = slip.elapsed;
          state.at = now;
        }
        slipMotion.set(actor.id, state);
        const frac =
          s.status === "running" && !reduced
            ? Math.min(1, (now - state.at) / clock.interval)
            : 0;
        const e = slip.elapsed + frac;
        const spinning = smooth(e / OIL.spinTicks);
        const angle = slip.spin * spinning * Math.PI * 4;
        const dazed =
          Math.max(0, e - OIL.spinTicks) / (OIL.slipTicks - OIL.spinTicks);
        const rock =
          (1 - dazed) *
          Math.sin(time * 14) *
          0.09 *
          (e >= OIL.spinTicks ? 1 : 0.4);
        spinVehicles(actor.objects, angle, rock);
        // Skid forward slightly while spinning, then settle.
        const lead = actor.objects.find((o) => o?.visible && o.position);
        if (lead && e >= OIL.spinTicks - 0.5) {
          const g = stars[i];
          g.visible = true;
          g.position.copy(lead.position);
          g.position.y += 1.45;
          g.children.forEach((star, n) => {
            const a = time * 3.2 + (n * Math.PI * 2) / 3;
            star.position.set(
              Math.cos(a) * 0.32,
              Math.sin(a * 1.7) * 0.04,
              Math.sin(a) * 0.32,
            );
            star.rotation.y = a * 2;
          });
        }
      });

      for (const o of rocked)
        if (!rockedNow.has(o)) {
          o.rotation.z = 0;
          rocked.delete(o);
        }

      // ---- creature
      const creature = hz.creature || {};
      const holds = [];
      const v = s.brandon.voyage;
      if (v?.held)
        holds.push({
          hold: v.held,
          ship: false,
          vessel: w.boat,
          center: { x: w.boat.position.x, z: w.boat.position.z, y: 0.05 },
        });
      for (const x of s.operations?.shipments || []) {
        if (!x.held) continue;
        const ship = w.realism?.importShip;
        if (ship)
          holds.push({
            hold: x.held,
            ship: true,
            vessel: ship,
            center: { x: ship.position.x, z: ship.position.z, y: 0.35 },
          });
      }
      units.forEach((unit, i) => {
        const h = holds[i];
        if (!h) {
          unit.unit.visible = false;
          return;
        }
        const hold = h.hold;
        const g =
          hold.status === "holding"
            ? smooth((tickFrac - hold.at) / 5)
            : 1 - smooth((tickFrac - hold.releasedAt) / CREATURE.releaseTicks);
        aim(unit, h.center, h.ship, g, time, tickFrac, 1);
        // The tentacles shake the vessel (absolute, so nothing accumulates).
        touched.add(h.vessel);
        const amp = reduced ? 0 : (h.ship ? 0.035 : 0.12) * g;
        h.vessel.rotation.z = Math.sin(time * 3.1 + i) * amp;
        h.vessel.rotation.x = Math.sin(time * 2.3 + i * 2) * amp * 0.7;
        h.vessel.position.y += (Math.sin(time * 4.2) * 0.5 + 0.7) * amp * 1.2;
      });
      for (const vessel of touched)
        if (!holds.some((h) => h.vessel === vessel)) {
          vessel.rotation.x = vessel.rotation.z = 0;
          touched.delete(vessel);
        }
      // Idle: just a shadow, ripples and bubbles circling the harbor.
      const showLurker = !!creature.enabled && holds.length === 0;
      lurker.unit.visible = showLurker;
      if (showLurker) {
        const a = time * 0.12;
        aim(
          lurker,
          { x: -5 + Math.cos(a) * 4.5, z: 21 + Math.sin(a * 1.3) * 3, y: 0 },
          false,
          0,
          time,
          tickFrac,
          0.1,
        );
        lurker.shadow.scale.set(1.9, 1.1, 1);
        lurker.rings.forEach((r) => r.scale.multiplyScalar(0.55));
      }
    },
  };
}
