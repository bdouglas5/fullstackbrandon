import {
  createAdaptiveResolution,
  resolutionCeiling,
} from "./adaptive-resolution.js";
import "./adaptive-resolution.css";
import { SHORELINE, shorelineCollection } from "../shared/shoreline.js";
import { createShorelineWorld } from "./world-shoreline.js";
import { createCameraMotion } from "./camera-motion.js";
import { visibleOrders } from "../shared/business-hours.js";
import { createCombatWorld } from "./world-combat.js";
import { LiveClock } from "./live-clock.js";
import { createHazardWorld } from "./world-hazards.js";
import { snapToRoad, OIL } from "../shared/hazards.js";
import {
  ISLANDS,
  FARM,
  HOME_BUSINESSES,
  HOME_GARAGE,
  CHARGING_STATION_POSITION,
  HARBOR_BERTH,
} from "../shared/islands.js";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildWorld } from "./world.js";
import { NODES, EDGES, DAY_TICKS } from "../shared/engine.js";
import "./workplace-stats.css";
import { optimizeWorld, instanceCitizens } from "./optimize-world.js";
import {
  ActorMotion,
  articulate,
  routeTrajectory,
  updatePedestrian,
} from "./world-motion.js";
import { createWorldLens } from "./world-shaders.js";
import { createOcean } from "./world-water.js";
import { applyWorldSurfaces } from "./world-surface.js";
import { createToyShading } from "./toy-shading.js";
import { createToyEnvironment } from "./toy-kit.js";
import { SEAT } from "./toy-scale.js";
import { updateFigurineDetail } from "./figurine.js";
import { createThunderAudio } from "./world-thunder.js";
import { createAtmosphere } from "./world-atmosphere.js";
import { createWorldLighting } from "./world-lighting.js";
import {
  animateVehicle,
  animateCitizen,
  taskForAction,
} from "./world-animation.js";
import { createVehicleEffects } from "./world-effects.js";
import { createRouteOverlay } from "./route-overlay.js";
import { setCrewTransportVisibility } from "./world-details.js";
import { frameBus } from "./frame-bus.js";
import {
  updateBusinessWorld,
  animateTireRepair,
  applyTransportTransition,
  separateRenderedActors,
} from "./world-realism.js";
import {
  advanceOrderNotifications,
  nextOrderNotificationDeadline,
} from "./order-notifications.js";
export default function Island({
  state,
  liveFeed = false,
  businessOpen = false,
  showOrderLabels = true,
  onSelect,
  viewReset,
  reducedMotion,
  followTarget = "brandon",
  onFollowTargetChange,
  notificationScope = "live",
  placingOil = false,
  onPlaceOil,
}) {
  const [resolutionNotice, setResolutionNotice] = useState(null);
  useEffect(() => {
    if (!resolutionNotice) return;
    const timer = setTimeout(() => setResolutionNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [resolutionNotice]);
  const [workplacePinned, setWorkplacePinned] = useState(false);
  const [workplaceHovered, setWorkplaceHovered] = useState(false);
  const workplaceAnchor = useRef(null);
  const shorelineAnchor = useRef(null);
  const [shorelineHovered, setShorelineHovered] = useState(false);
  const [shorelinePinned, setShorelinePinned] = useState(false);
  const shorelineHover = useRef(false);
  const cleanup = shorelineCollection(state);
  const hoverValue = useRef(false);
  const workplaceOrigin = state?.operations?.origin || "home";
  const workplaceName =
    workplaceOrigin === "farm_shop"
      ? "Pickle island factory"
      : workplaceOrigin === "cafe"
        ? "Brine & Co. office"
        : "Home garage";
  const todayStart =
    Math.floor(((state?.tick || 0) + DAY_TICKS / 3) / DAY_TICKS) * DAY_TICKS -
    DAY_TICKS / 3;
  const deliveredToday = (state?.customerHistory || []).filter(
    (order) => order.servedAt >= todayStart,
  ).length;
  const payroll = (state?.crew || []).reduce(
    (sum, member) => sum + (member.wagePerDay || 0),
    0,
  );
  const businessView = useRef(businessOpen);
  businessView.current = businessOpen;
  const host = useRef(),
    labels = useRef([]),
    data = useRef(state),
    feedLive = useRef(liveFeed),
    select = useRef(onSelect),
    controller = useRef(),
    following = useRef(false),
    selectedTarget = useRef(followTarget),
    followCallback = useRef(onFollowTargetChange),
    placing = useRef(placingOil),
    placeOil = useRef(onPlaceOil),
    hazardApi = useRef(null),
    [follow, setFollow] = useState(false),
    [failed, setFailed] = useState(false);
  const [orderNotices, setOrderNotices] = useState(() =>
    advanceOrderNotifications(
      null,
      state,
      performance.now(),
      notificationScope,
    ),
  );
  // Only orders Brandon is actually heading out to deliver get a dot on the
  // island; the full queue lives in Operations. Finished deliveries linger
  // briefly (the notice timeline) before fading.
  const islandNotices = orderNotices.items
    .filter(
      (n) =>
        n.status !== "pending" ||
        n.order.assigned ||
        n.order.id === state?.brandon?.orderId,
    )
    .slice(0, 4);
  const orderNoticesRef = useRef(islandNotices);
  orderNoticesRef.current = islandNotices;
  data.current = state;
  feedLive.current = liveFeed;
  selectedTarget.current = followTarget;
  followCallback.current = onFollowTargetChange;
  following.current = follow;
  select.current = onSelect;
  placing.current = placingOil;
  placeOil.current = onPlaceOil;
  useEffect(() => {
    const canvas = host.current?.querySelector("canvas");
    if (canvas) canvas.style.cursor = placingOil ? "crosshair" : "";
    if (!placingOil) hazardApi.current?.setPreview(null);
  }, [placingOil]);
  useEffect(() => {
    setOrderNotices((previous) =>
      advanceOrderNotifications(
        previous,
        state,
        performance.now(),
        notificationScope,
      ),
    );
  }, [state, notificationScope]);
  useEffect(() => {
    const deadline = nextOrderNotificationDeadline(orderNotices);
    if (deadline === null) return;
    const timer = setTimeout(
      () => {
        setOrderNotices((previous) =>
          advanceOrderNotifications(
            previous,
            data.current,
            performance.now(),
            notificationScope,
          ),
        );
      },
      Math.max(0, deadline - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [orderNotices, notificationScope]);
  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setFailed(true);
      return;
    }
    const resolution = createAdaptiveResolution(performance.now());
    let basePixelRatio = 1;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps painted toy colors from washing out.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D island. Drag to orbit, scroll to zoom. In whole-world view, use WASD or arrow keys to move the camera center. Use Inspect Brandon for keyboard access.",
    );
    renderer.domElement.setAttribute("role", "img");
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.environment = createToyEnvironment(renderer);
    scene.fog = new THREE.Fog("#95c8d0", 110, 220);
    scene.background = new THREE.Color("#95c8d0");
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 240);
    camera.position.set(26, 30, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(4, 0.1, 1);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.07;
    controls.minDistance = 6;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI / 2.6;
    controls.minPolarAngle = 0.35;
    controls.enablePan = false;
    const cameraKeys = new Set();
    const moveKeys = new Map([
      ["KeyW", "forward"],
      ["ArrowUp", "forward"],
      ["KeyS", "back"],
      ["ArrowDown", "back"],
      ["KeyA", "left"],
      ["ArrowLeft", "left"],
      ["KeyD", "right"],
      ["ArrowRight", "right"],
    ]);
    const cameraMotion = createCameraMotion();
    const clearCameraKeys = () => {
      cameraKeys.clear();
      cameraMotion.stop();
    };
    const cameraInputBlocked = (element) =>
      element?.closest?.(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tablist"], [role="menu"]',
      ) || document.querySelector('[role="dialog"], [aria-modal="true"]');
    const cameraKeyDown = (event) => {
      if (
        !moveKeys.has(event.code) ||
        following.current ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        cameraInputBlocked(event.target) ||
        !onScreen ||
        document.hidden
      )
        return;
      event.preventDefault();
      cameraKeys.add(event.code);
    };
    const cameraKeyUp = (event) => cameraKeys.delete(event.code);
    window.addEventListener("keydown", cameraKeyDown);
    window.addEventListener("keyup", cameraKeyUp);
    window.addEventListener("blur", clearCameraKeys);
    document.addEventListener("focusin", clearCameraKeys);
    const cameraForward = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraShift = new THREE.Vector3();
    controller.current = { camera, controls, clearCameraKeys };
    const ambient = new THREE.HemisphereLight("#fff5de", "#5f8a96", 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff3d1", 3.7);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    const shadowSize = window.innerWidth < 800 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.normalBias = 0.035;
    // Painted-miniature shadows: present and shaped, never ink-black.
    sun.shadow.intensity = 0.82;
    sun.shadow.bias = -0.0001;
    scene.add(sun, sun.target);
    const water = createOcean();
    const ocean = water.mesh;
    scene.add(ocean);
    const lens = createWorldLens(renderer, scene, camera);
    const w = buildWorld();
    const shorelineWorld = createShorelineWorld(w);
    const live = new LiveClock();
    let lastFrame = null;
    const combatWorld = createCombatWorld(w, live);
    const hazardWorld = createHazardWorld(w);
    hazardApi.current = hazardWorld;
    const lighting = createWorldLighting(scene, w);
    const vehicleEffects = createVehicleEffects(scene);
    optimizeWorld(w);
    const updateCitizens = instanceCitizens(w);
    scene.add(w.world);
    const sailor = w.body.clone(true);
    sailor.name = "Brandon sailboat captain";
    sailor.scale.setScalar(0.52);
    sailor.position.set(...SEAT.sailboat.position);
    w.boat.add(sailor);
    w.sailor = sailor;
    const atmosphere = createAtmosphere(scene, w, ocean, sun, ambient, {
      water,
    });
    const thunder = createThunderAudio();
    // Rain, wind, tide and sky light reach every painted surface.
    const sandMaterials = new Set(
      [...(w.materials?.entries() || [])]
        .filter(([color]) => color === "#ecd3a0")
        .map(([, material]) => material),
    );
    const foliageMaterials = new Set(
      [w.kit?.foliage, w.kit?.bark, w.kit?.palmLeaf].filter(Boolean),
    );
    // Diorama contact shading reads a height bake of the still scenery.
    const toyShading = createToyShading(renderer, scene, w, {
      foliage: foliageMaterials,
    });
    const surfaces = () => {
      applyWorldSurfaces(scene, {
        sand: sandMaterials,
        sway: foliageMaterials,
      });
      toyShading.patch(scene);
      toyShading.refresh();
    };
    surfaces();
    let surfaceAge = 0;
    const motions = new Map();
    const motionFor = (id) => {
      if (!motions.has(id)) motions.set(id, new ActorMotion({ clock: live }));
      return motions.get(id);
    };
    const shoreMotions = new Map();
    const routeOverlay = createRouteOverlay();
    scene.add(routeOverlay.line);
    let stormBlend = 0,
      tide = 0;
    const diagnostics0 = renderer.domElement.dataset;
    const subject = new THREE.Vector3();
    controller.current.subject = subject;
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = null;
    const pointerDown = (e) => {
      down = [e.clientX, e.clientY];
    };
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.41),
      groundHit = new THREE.Vector3();
    // Nearest road point under the pointer, or null when it is not near one.
    const roadPoint = () => {
      if (!ray.ray.intersectPlane(groundPlane, groundHit)) return null;
      const hit = snapToRoad([groundHit.x, groundHit.z], NODES, EDGES);
      return hit && hit.distance <= OIL.snap
        ? { x: hit.position[0], z: hit.position[1] }
        : null;
    };
    const click = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)
        return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      if (placing.current) {
        const at = roadPoint();
        if (at) placeOil.current?.(at);
        return;
      }
      const hitCrew = [...w.crewActors.entries()].find(
        ([, r]) =>
          ray.intersectObjects(
            [
              r.group,
              r.bicycle,
              r.van,
              r.rocketSkates,
              r.boat,
              r.helicopter,
              r.jetpack,
              r.teleporter,
            ].filter((o) => o.visible),
            true,
          ).length,
      );
      if (hitCrew) {
        followCallback.current?.(hitCrew[0]);
        setFollow(true);
      } else if (
        ray.intersectObjects(
          [
            w.brandon,
            w.van,
            w.rocketSkates,
            w.bike,
            w.boat,
            w.helicopter,
            w.jetpack,
            w.teleporter,
          ].filter((o) => o.visible),
          true,
        ).length
      ) {
        followCallback.current?.("brandon");
        select.current();
      }
    };
    const hoverWorkplace = (event) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      );
      ray.setFromCamera(pointer, camera);
      if (placing.current) hazardWorld.setPreview(roadPoint());
      const overShore = ray
        .intersectObject(shorelineWorld.root, true)
        .some((hit) => hit.object.visible);
      if (overShore !== shorelineHover.current) {
        shorelineHover.current = overShore;
        setShorelineHovered(overShore);
      }
      const origin = data.current?.operations?.origin || "home";
      const building =
        origin === "farm_shop"
          ? w.realism.estate
          : origin === "cafe"
            ? w.cafe
            : w.realism.garage;
      const hovered =
        building.visible && ray.intersectObject(building, true).length > 0;
      if (hovered !== hoverValue.current) {
        hoverValue.current = hovered;
        setWorkplaceHovered(hovered);
      }
    };
    const leaveWorkplace = () => {
      hoverValue.current = false;
      setWorkplaceHovered(false);
      shorelineHover.current = false;
      setShorelineHovered(false);
    };
    renderer.domElement.addEventListener("pointermove", hoverWorkplace);
    renderer.domElement.addEventListener("pointerleave", leaveWorkplace);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", click);
    const resize = () => {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      basePixelRatio = resolutionCeiling(
        width,
        height,
        window.devicePixelRatio,
      );
      renderer.setPixelRatio(basePixelRatio * resolution.scale);
      resolution.reset(performance.now());
      renderer.domElement.dataset.resolutionScale = String(resolution.scale);
      renderer.domElement.dataset.pixelRatio = String(renderer.getPixelRatio());
      renderer.setSize(width, height);
      camera.aspect = width / height;
      const scale = Math.max(1, Math.min(1.6, 1.15 / camera.aspect));
      if (!following.current)
        camera.position.set(26 * scale, 30 * scale, 40 * scale);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    let frame = null,
      previous = performance.now(),
      lastRenderTime = previous,
      onScreen = true,
      suspended = false,
      disposed = false;
    const target = new THREE.Vector3(),
      lightDirection = new THREE.Vector3(-8, 18, 10).normalize();
    let renderFrames = 0,
      frameInterval = 1000 / 60,
      lastFrameCost = 0;
    const render = (time) => {
      frame = null;
      if (disposed || !onScreen || document.hidden) {
        previous = time;
        suspended = true;
        renderer.domElement.dataset.renderingPaused = "true";
        return;
      }
      // Cap high-refresh displays at 60 FPS; adapt resolution to delivered frames.
      if (time - previous + 0.1 < frameInterval) {
        frame = requestAnimationFrame(render);
        return;
      }
      const qualityChange = resolution.sample(time, lastFrameCost);
      if (qualityChange) {
        renderer.setPixelRatio(basePixelRatio * qualityChange.scale);
        renderer.domElement.dataset.resolutionScale = String(
          qualityChange.scale,
        );
        renderer.domElement.dataset.pixelRatio = String(
          renderer.getPixelRatio(),
        );
        setResolutionNotice(qualityChange);
      }
      if (resolution.fps !== null)
        renderer.domElement.dataset.measuredFps = String(
          Math.round(resolution.fps),
        );
      renderer.domElement.dataset.targetFps = "60";
      const frameStart = performance.now();
      const dt = Math.min((time - lastRenderTime) / 1000, 0.1);
      lastRenderTime = time;
      previous = time - ((time - previous) % frameInterval);
      let latest = data.current;
      // Frames React batched away still reach the playout clock, in order.
      const queued = frameBus.drain();
      if (!feedLive.current) queued.length = 0;
      if (queued.length && (!latest || (queued.at(-1).tick ?? 0) >= (latest.tick ?? 0)))
        latest = queued.pop();
      const t = reducedMotion ? 0 : time / 1000;
      // Everything below is drawn from one moment: the frame that was true at
      // the clock's displayed time. Newest frames only feed the playout.
      let s = latest;
      if (latest) {
        for (const older of queued) {
          if ((older.tick ?? 0) <= live.latest || older === lastFrame) continue;
          live.push(older);
          motionFor("brandon").update(older.brandon, older, 0, reducedMotion);
          for (const member of older.crew || [])
            motionFor(member.id).update(member, older, 0, reducedMotion);
        }
        if (latest !== lastFrame) {
          live.push(latest);
          lastFrame = latest;
        }
        live.advance(dt, latest.status === "running", reducedMotion);
        motionFor("brandon").update(latest.brandon, latest, dt, reducedMotion);
        for (const member of latest.crew || [])
          motionFor(member.id).update(member, latest, dt, reducedMotion);
        for (const who of [latest.brandon, ...(latest.crew || [])]) {
          const id = who.id || "brandon";
          const cv = who.voyage;
          if (!cv?.onShore || !cv.courierPosition) continue;
          if (!shoreMotions.has(id))
            shoreMotions.set(id, new ActorMotion({ clock: live }));
          shoreMotions.get(id).update(
            {
              ...who,
              position: cv.courierPosition,
              voyage: null,
              shoreVoyage: cv,
              move: null,
              node: null,
            },
            latest,
            dt,
            reducedMotion,
          );
        }
        // Brandon is what the camera and the player watch: the scene's discrete
        // state is the frame that matches the pose his figure is showing.
        s = live.at(motionFor("brandon").shownTick, latest);
      }
      if (s) {
        const active = s.status === "running";
        const actor = s.brandon;
        const voyage = actor.voyage;
        const roadMode = actor.mountedMode ?? s.vehicle;
        const mode =
          voyage?.mode ||
          (["foot", "bike", "van", "rocket_skates"].includes(roadMode)
            ? roadMode
            : "foot");
        const transport = mode === "boat" ? "sailboat" : mode;
        const motion = motionFor("brandon");
        const moving = !actor.combat && motion.moving;
        const owned = s.vehicles || [];
        const groundY = 0.43;
        const setPose = (
          object,
          position = motion.position,
          heading = motion.heading,
        ) => {
          object.position.copy(position);
          object.rotation.y = heading;
        };
        const park = (object, p, kind) => {
          const parked =
            (actor.move?.docking && kind === s.vehicle
              ? actor.roadVehiclePosition
              : null) ||
            s.vehicleLocations?.[kind]?.position ||
            object.userData.parkedPosition ||
            p;
          object.userData.driving = false;
          // Settle into the bay instead of popping there when the rider steps off.
          const gap = Math.hypot(
            parked[0] - object.position.x,
            parked[1] - object.position.z,
          );
          if (!object.userData.parkedSeen || gap > 8) {
            object.position.set(parked[0], groundY, parked[1]);
            object.userData.parkedSeen = true;
          } else {
            const k = 1 - Math.exp(-Math.min(dt, 0.1) / 0.14);
            object.position.set(
              object.position.x + (parked[0] - object.position.x) * k,
              groundY,
              object.position.z + (parked[1] - object.position.z) * k,
            );
          }
          object.userData.lastX = object.position.x;
          object.userData.lastZ = object.position.z;
        };
        const drive = (object) => {
          setPose(object);
          // Hand over from the bay to the rider over a moment, not a pop.
          const u = object.userData;
          if (!u.driving) {
            const dx = object.userData.lastX - motion.position.x,
              dz = object.userData.lastZ - motion.position.z;
            const gap = Math.hypot(dx, dz);
            u.handX = gap > 0 && gap < 8 ? dx : 0;
            u.handZ = gap > 0 && gap < 8 ? dz : 0;
            u.driving = true;
          }
          const k = Math.exp(-Math.min(dt, 0.1) / 0.16);
          u.handX *= k;
          u.handZ *= k;
          object.position.x += u.handX;
          object.position.z += u.handZ;
          object.userData.parkedPosition = [
            motion.position.x,
            motion.position.z,
          ];
        };
        const onShore = !!voyage?.onShore;
        let personMotion = motion;
        if (onShore && voyage.courierPosition && shoreMotions.has("brandon")) {
          personMotion = shoreMotions.get("brandon");
        } else if (!onShore) shoreMotions.delete("brandon");
        const shoreState = shorelineWorld.update(
          s,
          personMotion,
          dt,
          reducedMotion,
        );
        renderer.domElement.dataset.shorelinePhase = actor.buildingVisit
          ?.shoreline
          ? actor.buildingVisit.phase
          : "idle";
        renderer.domElement.dataset.shorelinePieces = String(
          shoreState.remaining,
        );
        renderer.domElement.dataset.shorelinePickup = String(
          shoreState.animated,
        );
        const working =
          active &&
          !actor.homeRoutine &&
          !actor.transition &&
          !actor.vehicleApproach &&
          !actor.combat &&
          !actor.slip &&
          (!actor.buildingVisit || actor.buildingVisit.phase === "inside") &&
          ((!actor.move && !voyage) || (onShore && !personMotion.moving));
        const building = !!actor.buildingVisit;
        const doorway = new THREE.Vector3(4.45, 0.43, -4.78);
        const insideWorkshop =
          actor.buildingVisit?.phase === "inside" &&
          personMotion.position.distanceTo(doorway) < 0.08;
        w.brandon.visible = transport === "foot" || onShore || building;
        setPose(w.brandon, personMotion.position, personMotion.facing);
        if (insideWorkshop && !actor.combat) w.brandon.visible = false;
        if (
          actor.buildingVisit?.delivery &&
          actor.buildingVisit.phase === "inside" &&
          personMotion.position.distanceTo(
            new THREE.Vector3(
              ...[
                actor.buildingVisit.inside[0],
                0.43,
                actor.buildingVisit.inside[1],
              ],
            ),
          ) < 0.08 &&
          !actor.combat
        )
          w.brandon.visible = false;
        const insideHome =
          actor.homeRoutine?.phase === "sleeping" &&
          personMotion.position.distanceTo(
            new THREE.Vector3(7.45, 0.43, -4.85),
          ) < 0.08;
        if (insideHome && !actor.combat) w.brandon.visible = false;
        w.buildEffect.visible =
          actor.buildingVisit?.phase === "inside" &&
          !actor.buildingVisit.delivery &&
          !actor.buildingVisit.warehouse &&
          !actor.buildingVisit.shoreline;
        w.buildSparks.forEach((spark, i) => {
          const phase = (t * 0.65 + i / 14) % 1;
          spark.position.set(
            Math.sin(i * 2.4) * 1.15,
            0.6 + phase * 1.7,
            Math.cos(i * 2.4) * 0.85,
          );
          spark.scale.setScalar(Math.sin(phase * Math.PI) * 1.5);
        });
        articulate(w.body, personMotion, {
          walking: !actor.combat && w.brandon.visible && personMotion.moving,
          working: working && !actor.combat,
          carrying:
            !actor.combat &&
            (s.carry || 0) +
              (s.operations?.inboundCarry || 0) +
              (s.operations?.resourceCarry || 0) >
              0,
          cargoCount:
            (s.carry || 0) +
            (s.operations?.inboundCarry || 0) +
            (s.operations?.resourceCarry || 0),
          gatheringPlastic: shoreState.animated,
          task: taskForAction(actor.action),
          time: t,
          dt,
          reducedMotion,
        });
        w.ring.visible =
          following.current && selectedTarget.current === "brandon";
        w.bike.visible = owned.includes("bike") && !voyage;
        w.van.visible = owned.includes("van") && !voyage;
        if (transport === "bike") drive(w.bike);
        else park(w.bike, [5.5, 3.15], "bike");
        if (transport === "van") drive(w.van);
        else park(w.van, s.parkedVan?.position || [5.4, 4.8], "van");
        w.rocketSkates.visible = transport === "rocket_skates" && !voyage;
        if (w.rocketSkates.visible) setPose(w.rocketSkates);
        w.skater.visible = w.rocketSkates.visible;
        articulate(w.skater, motion, {
          skating: true,
          flying: true,
          carrying:
            (s.carry || 0) +
              (s.operations?.inboundCarry || 0) +
              (s.operations?.resourceCarry || 0) >
            0,
          cargoCount:
            (s.carry || 0) +
            (s.operations?.inboundCarry || 0) +
            (s.operations?.resourceCarry || 0),
          time: t,
          dt,
          reducedMotion,
        });
        w.driver.visible = transport === "van" && !building;
        w.rider.visible = transport === "bike" && !building;
        if (w.rider.visible && !actor.transition && !actor.combat)
          articulate(w.rider, motion, {
            cycling: true,
            carrying: false,
            cargoCount:
              (s.carry || 0) +
              (s.operations?.inboundCarry || 0) +
              (s.operations?.resourceCarry || 0),
            time: t,
            dt,
            reducedMotion,
          });
        articulate(w.driver, motion, {
          seated: true,
          time: t,
          dt,
          reducedMotion,
        });
        w.vanCargo.forEach(
          (c, i) =>
            (c.visible =
              i <
              Math.ceil(
                ((s.carry || 0) +
                  (s.operations?.inboundCarry || 0) +
                  (s.operations?.resourceCarry || 0)) /
                  2,
              )),
        );
        w.vanRing.visible = following.current && transport === "van";
        w.boat.visible = owned.includes("sailboat") || owned.includes("boat");
        if (transport === "sailboat") setPose(w.boat);
        else w.boat.position.set(HARBOR_BERTH[0], -0.63, HARBOR_BERTH[1]);
        sailor.visible = transport === "sailboat" && !onShore;
        articulate(sailor, motion, { time: t, dt, reducedMotion });
        w.helicopter.visible = owned.includes("helicopter");
        if (transport === "helicopter") setPose(w.helicopter);
        else {
          park(w.helicopter, [14.5, -6.3]);
          w.helicopter.rotation.y = 0;
        }
        w.pilot.visible = transport === "helicopter" && !onShore;
        articulate(w.pilot, motion, {
          seated: true,
          time: t,
          dt,
          reducedMotion,
        });
        w.jetpack.visible = transport === "jetpack" && !onShore;
        if (w.jetpack.visible) setPose(w.jetpack);
        articulate(w.jetPilot, motion, {
          flying: true,
          cargoCount:
            (s.carry || 0) +
            (s.operations?.inboundCarry || 0) +
            (s.operations?.resourceCarry || 0),
          carrying:
            (s.carry || 0) +
              (s.operations?.inboundCarry || 0) +
              (s.operations?.resourceCarry || 0) >
            0,
          time: t,
          dt,
          reducedMotion,
        });
        for (const [kind, model, parts] of [
          ["bike", w.bike, { wheels: w.bikeWheels }],
          ["rocket_skates", w.rocketSkates, { exhaust: w.skateExhaust }],
          [
            "van",
            w.van,
            { chassis: w.chassis, wheels: w.wheels, flatTire: s.flatTire },
          ],
          ["sailboat", w.boat, {}],
          [
            "helicopter",
            w.helicopter,
            { rotor: w.rotor, tailRotor: w.tailRotor },
          ],
          ["jetpack", w.jetpack, { exhaust: w.beacons }],
        ])
          animateVehicle(model, motion, {
            kind,
            active: transport === kind && !onShore && !actor.transition,
            time: t,
            dt,
            reducedMotion,
            ...parts,
          });
        vehicleEffects.emit(
          "brandon",
          onShore ? "foot" : transport,
          personMotion,
          dt,
          {
            active,
            time: t,
            reducedMotion,
          },
        );
        w.teleporter.visible = transport === "teleporter" && !onShore;
        if (w.teleporter.visible) setPose(w.teleporter);
        w.portalPilot.visible = !/Teleporting/.test(voyage?.phase || "");
        w.portalRings.forEach((r, i) => {
          r.rotation.z = reducedMotion ? 0 : t * (i ? -0.8 : 0.7);
          r.material.opacity = 0.5 + Math.sin(t * 5 + i) * 0.2;
        });
        w.roadCones.visible = !!s.traffic;
        w.barriers.visible = !!s.bridgeClosed;
        // Installed tools have physical models. Active tasks animate the relevant tool beside Brandon.
        Object.entries(w.gadgetModels).forEach(
          ([id, model]) => (model.visible = !!s.tools?.[id]),
        );
        const action = actor.action || "";
        const activeTool =
          Object.keys(w.gadgetModels).find((id) => action.includes(id)) ||
          (action === "patch"
            ? "repair_kit"
            : action === "charge"
              ? "solar_panel"
              : working && s.tools?.cargo_dolly
                ? "cargo_dolly"
                : working && s.tools?.scanner
                  ? "scanner"
                  : null);
        if (w.activeGadget.userData.tool !== activeTool) {
          w.activeGadget.clear();
          if (activeTool) {
            const model = w.gadgetModels[activeTool].clone(true);
            model.position.set(0.45, 0.1, 0.2);
            model.visible = true;
            w.activeGadget.add(model);
          }
          w.activeGadget.userData.tool = activeTool;
        }
        w.workEffect.visible = working && !!actor.action && !building;
        w.workEffect.scale.setScalar(0.52);
        w.workEffect.position.copy(w.brandon.position);
        w.workEffect.rotation.y = w.brandon.rotation.y;
        w.effectParcel.visible = false;
        w.effectParcel.position.y =
          0.55 + (reducedMotion ? 0 : Math.sin(t * 4) * 0.09);
        w.effectParcel.rotation.y = reducedMotion ? 0 : Math.sin(t * 2) * 0.1;
        w.effectGlow.material.opacity =
          0.3 + (reducedMotion ? 0 : Math.sin(t * 3) * 0.15);
        const repairAnimation = animateTireRepair(
          w,
          actor,
          s.flatTire,
          motion,
          t,
          dt,
          reducedMotion,
        );
        const transportAnimation = applyTransportTransition(w, actor, motion, {
          active,
          cargoCount:
            (s.carry || 0) +
            (s.operations?.inboundCarry || 0) +
            (s.operations?.resourceCarry || 0),
          time: t,
          dt,
          reducedMotion,
        });
        const businessAnimation = updateBusinessWorld(
          w,
          s,
          t,
          dt,
          reducedMotion,
        );
        const renderedActors = [
          {
            id: "brandon",
            mode: onShore ? "foot" : transport,
            radius: repairAnimation.active ? 1.35 : undefined,
            position: (onShore
              ? personMotion.position
              : motion.position
            ).clone(),
            objects: [
              w.brandon,
              ...(transport === "foot"
                ? []
                : [
                    {
                      bike: w.bike,
                      van: w.van,
                      rocket_skates: w.rocketSkates,
                      sailboat: w.boat,
                      helicopter: w.helicopter,
                      jetpack: w.jetpack,
                      teleporter: w.teleporter,
                    }[transport],
                  ]),
            ],
          },
        ];
        const subjects = new Map([
          ["brandon", onShore ? personMotion.position : motion.position],
        ]);
        const crewTransports = {};
        for (const listed of s.crew || []) {
          const cm = motionFor(listed.id);
          // Each teammate's own state matches the pose that teammate is showing.
          const member =
            (live.at(cm.shownTick, s)?.crew || []).find(
              (c) => c.id === listed.id,
            ) || listed;
          const rig = w.crewActors.get(member.id) || w.createCrew(member);
          const cv = member.voyage;
          crewTransports[member.id] = setCrewTransportVisibility(
            rig,
            member,
            cm.moving,
          );
          const foot = !cv && crewTransports[member.id].mode === "foot";
          let courierMotion = cm;
          let cp = cm.position;
          if (
            cv?.onShore &&
            cv.courierPosition &&
            shoreMotions.has(member.id)
          ) {
            courierMotion = shoreMotions.get(member.id);
            cp = courierMotion.position;
          } else if (!cv?.onShore) shoreMotions.delete(member.id);
          setPose(rig.group, cp, courierMotion.facing);
          if (!foot && !cv && rig.group.visible) rig.group.position.z += 0.95;
          articulate(rig.body, courierMotion, {
            walking: (foot || cv?.onShore) && courierMotion.moving,
            working: !courierMotion.moving,
            carrying: member.carry > 0,
            task: taskForAction(member.action),
            time: t,
            dt,
            reducedMotion,
          });
          setPose(rig.van, cm.position, cm.heading);
          articulate(rig.driver, cm, {
            seated: true,
            time: t,
            dt,
            reducedMotion,
          });
          setPose(rig.rocketSkates, cm.position, cm.heading);
          articulate(rig.skater, cm, {
            skating: true,
            flying: true,
            carrying: member.carry > 0,
            time: t,
            dt,
            reducedMotion,
          });
          setPose(rig.bicycle, cm.position, cm.heading);
          if (rig.rider.visible && !member.transition && !member.combat)
            articulate(rig.rider, cm, {
              cycling: true,
              time: t,
              dt,
              reducedMotion,
            });
          setPose(rig.boat, cm.position, cm.heading);
          setPose(rig.helicopter, cm.position, cm.heading);
          articulate(rig.sailor, cm, { time: t, dt, reducedMotion });
          articulate(rig.pilot, cm, {
            seated: true,
            time: t,
            dt,
            reducedMotion,
          });
          setPose(rig.jetpack, cm.position, cm.heading);
          articulate(rig.jetPilot, cm, {
            flying: true,
            carrying: member.carry > 0,
            time: t,
            dt,
            reducedMotion,
          });
          for (const [kind, model, parts] of [
            ["bike", rig.bicycle, {}],
            ["van", rig.van, { chassis: rig.chassis, wheels: rig.wheels }],
            ["rocket_skates", rig.rocketSkates, { exhaust: rig.skateExhaust }],
            ["sailboat", rig.boat, {}],
            [
              "helicopter",
              rig.helicopter,
              { rotor: rig.rotor, tailRotor: rig.tailRotor },
            ],
            ["jetpack", rig.jetpack, { exhaust: rig.exhaust }],
          ])
            animateVehicle(model, cm, {
              kind,
              active: crewTransports[member.id].mode === kind && !cv?.onShore,
              time: t,
              dt,
              reducedMotion,
              ...parts,
            });
          setPose(rig.teleporter, cm.position, cm.heading);
          articulate(rig.portalPilot, cm, {
            carrying: member.carry > 0,
            time: t,
            dt,
            reducedMotion,
          });
          rig.portalRings.forEach((r, i) => {
            r.rotation.z = reducedMotion ? 0 : t * (i ? -0.8 : 0.7);
            r.material.opacity = 0.5 + Math.sin(t * 5 + i) * 0.2;
          });
          rig.marker.visible = selectedTarget.current === member.id;
          vehicleEffects.emit(
            member.id,
            cv?.onShore ? "foot" : crewTransports[member.id].mode,
            courierMotion,
            dt,
            {
              active,
              time: t,
              reducedMotion,
            },
          );
          const crewTransition = applyTransportTransition(
            rig,
            member,
            courierMotion,
            { time: t, dt, reducedMotion },
          );
          if (crewTransition)
            crewTransports[member.id].phase = crewTransition.phase;
          const physicalPosition = cp.clone();
          renderedActors.push({
            id: member.id,
            mode:
              cv?.onShore || member.transition
                ? "foot"
                : crewTransports[member.id].mode,
            position: physicalPosition,
            objects: [
              rig.group,
              rig.bicycle,
              rig.van,
              rig.rocketSkates,
              rig.boat,
              rig.helicopter,
              rig.jetpack,
              rig.teleporter,
            ],
          });
          subjects.set(member.id, physicalPosition);
        }
        for (const [id, rig] of w.crewActors)
          if (!(s.crew || []).some((c) => c.id === id)) {
            rig.group.visible = false;
            rig.bicycle.visible = false;
            rig.van.visible = false;
            rig.rocketSkates.visible = false;
            rig.boat.visible = false;
            rig.helicopter.visible = false;
            rig.jetpack.visible = false;
            rig.teleporter.visible = false;
          }
        const actorFootprints = separateRenderedActors(renderedActors);
        combatWorld.update(s, motion, t, reducedMotion, latest);
        hazardWorld.update(s, time, reducedMotion);
        renderer.domElement.dataset.oilSpills = String(
          (s.hazards?.spills || []).filter((o) => !o.cleanedAt).length,
        );
        renderer.domElement.dataset.oilPositions = JSON.stringify(
          (s.hazards?.spills || []).map((o) => [o.x, o.z]),
        );
        renderer.domElement.dataset.creatureHolds = String(
          [
            s.brandon.voyage?.held,
            ...(s.operations?.shipments || []).map((x) => x.held),
          ].filter(Boolean).length,
        );
        renderer.domElement.dataset.defenseParticles = String(
          combatWorld.particleCount(),
        );
        renderer.domElement.dataset.combatFx = String(combatWorld.fxCount());
        renderer.domElement.dataset.zombies = String(
          (s.zombies || []).filter((z) => z.hp > 0).length,
        );
        renderer.domElement.dataset.skatesVisible = String(
          w.rocketSkates.visible,
        );
        renderer.domElement.dataset.skaterVisible = String(w.skater.visible);
        renderer.domElement.dataset.combatPhase = actor.combat?.phase || "none";
        renderer.domElement.dataset.combatOnFoot = String(
          !!actor.combat &&
            w.brandon.visible &&
            !w.driver.visible &&
            !w.rider.visible,
        );
        subjects.set(
          "brandon",
          actor.combat?.kind === "cleanup"
            ? w.brandon.position
            : renderedActors[0].position,
        );
        subject.copy(subjects.get(selectedTarget.current) || motion.position);
        if (following.current && selectedTarget.current !== "overview") {
          const shift = subject
            .clone()
            .sub(controls.target)
            .multiplyScalar(reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
          controls.target.add(shift);
          camera.position.add(shift);
        }
        const weather = atmosphere.update(
          s,
          t,
          dt,
          controls.target,
          reducedMotion,
          camera,
          { height: host.current.clientHeight * renderer.getPixelRatio() },
        );
        thunder.update(weather, s?.environment?.soundEnabled === true);
        const illumination = lighting.update(
          weather,
          t,
          dt,
          controls.target,
          renderer,
          reducedMotion,
        );
        lens.setNight(illumination.strength, weather.golden || 0);
        lens.setGrade(weather.grade);
        renderer.domElement.dataset.lightSources = String(
          illumination.sourceCount,
        );
        renderer.domElement.dataset.localLights = String(
          illumination.localLightCount,
        );
        renderer.domElement.dataset.nightStrength = String(
          illumination.strength,
        );
        renderer.domElement.dataset.glowPoints = String(
          illumination.sourceCount,
        );
        renderer.domElement.dataset.reducedMotion = String(reducedMotion);
        renderer.domElement.dataset.secondaryMotionPhase = String(t);
        renderer.domElement.dataset.animationStyle = "expressive";
        renderer.domElement.dataset.cargoCases = String(
          w.body.userData.cargoCases || 0,
        );
        renderer.domElement.dataset.stormIntensity = String(
          weather.stormIntensity,
        );
        renderer.domElement.dataset.fogIntensity = String(weather.fogIntensity);
        renderer.domElement.dataset.cloudCover = String(
          s?.environment?.clouds ?? 1,
        );
        renderer.domElement.dataset.deliveryVisit = actor.buildingVisit
          ?.delivery
          ? actor.buildingVisit.phase
          : "none";
        stormBlend = weather.stormIntensity;
        tide = weather.tide || 0;
        // The atmosphere leaves the sun/moon direction in sun.position.
        lightDirection.copy(sun.position).normalize();
        w.wind.time.value = t;
        w.wind.strength.value = 0.065 + weather.stormIntensity * 0.215;
        diagnostics0.wetness = String(weather.wetness);
        diagnostics0.sunElevation = String(weather.sunElevation);
        renderer.domElement.dataset.reversing = String(!!motion.reversing);
        renderer.domElement.dataset.characterScale = String(w.brandon.scale.x);
        renderer.domElement.dataset.building = String(building);
        const routeActor =
          (s.crew || []).find((c) => c.id === selectedTarget.current) || actor;
        const routeMotion = routeActor.voyage?.onShore
          ? shoreMotions.get(routeActor.id || "brandon")
          : motions.get(routeActor.id || "brandon");
        const points = routeTrajectory(routeActor, s, routeMotion);
        routeOverlay.update(points, reducedMotion ? 0 : dt, active);
        renderer.domElement.dataset.routeStyle = "flowing";
        renderer.domElement.dataset.routeWidth = String(
          routeOverlay.line.material.linewidth,
        );
        renderer.domElement.dataset.routeStart = JSON.stringify(points[0]);
        renderer.domElement.dataset.routePoints = JSON.stringify(points);
        renderer.domElement.dataset.routePosition = JSON.stringify(
          routeMotion?.position.toArray(),
        );
        renderer.domElement.dataset.cameraDistance = String(
          camera.position.distanceTo(controls.target),
        );
        renderer.domElement.dataset.routeHeight = String(
          Math.max(...points.map((p) => p[1])),
        );
        renderer.domElement.dataset.heading = String(motion.heading);
        renderer.domElement.dataset.brandonPose = `${motion.position.x.toFixed(4)},${motion.position.z.toFixed(4)}`;
        renderer.domElement.dataset.liveLag = live.lag.toFixed(3);
        renderer.domElement.dataset.liveTickRate = live.tickRate.toFixed(2);
        w.customers.forEach((c, i) => {
          const customer = c.userData.customer;
          c.userData.serviceHome ||= [c.position.x, c.position.z];
          const [cx, cz] = c.userData.serviceHome;
          let nearest = null,
            distance = Infinity;
          for (const subject of subjects.values()) {
            const away = Math.hypot(subject.x - cx, subject.z - cz);
            if (away < distance) {
              nearest = subject;
              distance = away;
            }
          }
          const near = distance < 2.4;
          if (near && !c.userData.wasYielding) {
            c.userData.yieldDirection =
              distance > 0.01
                ? [(cx - nearest.x) / distance, (cz - nearest.z) / distance]
                : [1, 0];
          }
          c.userData.wasYielding = near;
          c.userData.yieldOffset = THREE.MathUtils.damp(
            c.userData.yieldOffset || 0,
            near ? 1.1 : 0,
            5,
            dt,
          );
          const direction = c.userData.yieldDirection || [1, 0];
          c.position.x = cx + direction[0] * c.userData.yieldOffset;
          c.position.z = cz + direction[1] * c.userData.yieldOffset;
          c.visible = true;
          const facing = HOME_BUSINESSES[customer?.id]?.facing ?? -0.5;
          const pending = visibleOrders(s).some(
            (p) => p.name === customer?.name,
          );
          // Brandon at their door with their order: hands out for the parcel.
          const receiving =
            !!actor.action &&
            actor.action === `serve_${customer?.id}` &&
            !actor.move &&
            !voyage;
          // A shopkeeper turns their head toward Brandon as he comes near.
          const toward = new THREE.Vector3()
            .copy(personMotion.position)
            .sub(c.position);
          const away = Math.hypot(toward.x, toward.z);
          const yaw = THREE.MathUtils.clamp(
            Math.atan2(
              Math.sin(Math.atan2(toward.x, toward.z) - facing),
              Math.cos(Math.atan2(toward.x, toward.z) - facing),
            ),
            -1.1,
            1.1,
          );
          animateCitizen(c, {
            time: t,
            dt,
            pending,
            receiving,
            phase: i,
            facing,
            look:
              away < 4.4
                ? {
                    yaw,
                    weight: THREE.MathUtils.smoothstep(4.4 - away, 0, 1.6),
                  }
                : null,
            reducedMotion,
          });
        });
        let yielding = 0;
        w.pedestrians.forEach((p) => {
          if (updatePedestrian(p, t, dt, [...subjects.values()], reducedMotion))
            yielding++;
        });
        renderer.domElement.dataset.yieldingPedestrians = String(yielding);
        const diagnostics = renderer.domElement.dataset;
        diagnostics.activeVehicle = transport;
        diagnostics.riderVisible = String(w.rider.visible);
        diagnostics.walkerVisible = String(w.brandon.visible);
        diagnostics.bikePosition = JSON.stringify(w.bike.position.toArray());
        diagnostics.transportPhase = transportAnimation?.phase || "travelling";
        diagnostics.flatTirePhase = repairAnimation.phase;
        diagnostics.constructionStage = businessAnimation.constructionStage;
        diagnostics.factoryActive = String(businessAnimation.factoryActive);
        diagnostics.shipmentStage = businessAnimation.shipmentStage;
        diagnostics.actorFootprints = JSON.stringify(actorFootprints);
        diagnostics.followTarget = selectedTarget.current;
        diagnostics.crewCount = String((s.crew || []).length);
        diagnostics.crewTransports = JSON.stringify(crewTransports);
        diagnostics.weather = weather.weather;
        diagnostics.rainIntensity = String(weather.rainIntensity);
        diagnostics.phase = weather.phase;
        diagnostics.worldPhase = weather.phase;
        diagnostics.night = String(weather.night);
        diagnostics.walking = String(transport === "foot" && moving);
        diagnostics.legSwing = String(w.legs[0].rotation.x);
        diagnostics.customerIslands = String(
          new Set(w.customers.map((c) => c.userData.customer?.island || "home"))
            .size,
        );
        diagnostics.gadgets = String(Object.keys(s.tools || {}).length);
        diagnostics.position = JSON.stringify(motion.position.toArray());
        diagnostics.altitude = String(motion.position.y);
      }
      if (s?.brandon.voyage?.mode !== "sailboat")
        w.boat.position.y = -0.63 + tide + Math.sin(t) * 0.025;
      else w.boat.position.y += tide;
      for (const detail of w.secondaryMotion || []) {
        if (detail.object.name === "sail") continue;
        detail.object.rotation[detail.axis] =
          detail.base +
          (reducedMotion
            ? 0
            : Math.sin(t * detail.speed + detail.phase) *
              detail.amplitude *
              (1 + stormBlend * 0.65));
      }
      renderer.domElement.dataset.secondaryMotionCount = String(
        w.secondaryMotion?.length || 0,
      );
      vehicleEffects.update(t, dt, reducedMotion);
      renderer.domElement.dataset.travelParticles = String(
        vehicleEffects.count,
      );
      w.clouds.forEach((c, i) => {
        const target = Math.max(
          0,
          Math.min(
            1,
            (s?.world?.weather === "clear" ? 0.18 : 1) * w.clouds.length - i,
          ),
        );
        c.userData.coverage = THREE.MathUtils.damp(
          c.userData.coverage ?? 1,
          target,
          1.2,
          dt,
        );
        c.visible = c.userData.coverage > 0.01;
        c.traverse((mesh) => {
          if (mesh.isMesh) {
            mesh.material.transparent = true;
            mesh.material.opacity = c.userData.coverage;
            const tint = w.materials?.get?.("#f4f5e9");
            if (tint) {
              mesh.material.color.copy(tint.color);
              mesh.material.emissive.copy(tint.emissive);
            }
          }
        });
        const drift =
          (c.userData.drift || 0) +
          (reducedMotion ? 0 : dt * c.userData.speed * (1 + stormBlend * 1.2));
        c.userData.drift = drift;
        c.position.x =
          c.userData.baseX + Math.sin(drift + c.userData.phase) * 5;
        c.position.z =
          c.userData.baseZ + Math.sin(drift * 0.6 + c.userData.phase) * 2;
      });
      surfaceAge += dt;
      if (surfaceAge > 1) {
        // Newly hired crew bring new uniform materials.
        surfaceAge = 0;
        surfaces();
      }
      if (following.current || cameraInputBlocked(document.activeElement)) {
        clearCameraKeys();
      } else {
        const directions = new Set(
          [...cameraKeys].map((key) => moveKeys.get(key)),
        );
        const forward =
          Number(directions.has("forward")) - Number(directions.has("back"));
        const right =
          Number(directions.has("right")) - Number(directions.has("left"));
        // Move both camera and orbit center across the ground plane. The
        // current orbit heading defines forward; distance and tilt stay intact.
        cameraForward
          .copy(controls.target)
          .sub(camera.position)
          .setY(0)
          .normalize();
        cameraRight.set(-cameraForward.z, 0, cameraForward.x);
        cameraShift
          .copy(cameraForward)
          .multiplyScalar(forward)
          .addScaledVector(cameraRight, right);
        const shift = cameraMotion.advance(
          cameraShift,
          camera.position.distanceTo(controls.target),
          dt,
          reducedMotion,
        );
        controls.target.add(shift);
        camera.position.add(shift);
      }
      renderer.domElement.dataset.cameraPanSpeed = String(cameraMotion.speed);
      controls.update();
      renderer.domElement.dataset.cameraTarget = JSON.stringify(
        controls.target.toArray(),
      );
      renderer.domElement.dataset.cameraPosition = JSON.stringify(
        camera.position.toArray(),
      );
      // Keep useful contact shadows in the district being viewed; snap the
      // light's anchor to shadow texels to avoid shimmering during orbit.
      const shadowTexel = 44 / shadowSize;
      const shadowX = Math.round(controls.target.x / shadowTexel) * shadowTexel;
      const shadowZ = Math.round(controls.target.z / shadowTexel) * shadowTexel;
      sun.target.position.set(shadowX, 0, shadowZ);
      sun.position
        .copy(sun.target.position)
        .addScaledVector(lightDirection, 32);
      const width = host.current.clientWidth,
        height = host.current.clientHeight;
      if (businessView.current)
        camera.setViewOffset(
          width,
          height,
          window.innerWidth > 800
            ? Math.min(680, window.innerWidth * 0.51) / 2
            : 0,
          window.innerWidth <= 800 ? height * 0.25 : 0,
          width,
          height,
        );
      else if (camera.view?.enabled) camera.clearViewOffset();
      const anchors = [
        new THREE.Vector3(4, 2.8, 0.15),
        new THREE.Vector3(-4.2, 3.4, 14.4),
        new THREE.Vector3(4, 2.1, -4.6),
        subject.clone().add(new THREE.Vector3(0, 2, 0)),
        new THREE.Vector3(10, 2.4, 0.05),
        new THREE.Vector3(
          CHARGING_STATION_POSITION[0],
          2.4,
          CHARGING_STATION_POSITION[1],
        ),
        new THREE.Vector3(FARM.x, 2.6, FARM.z),
        ...Object.values(ISLANDS).map((i) => new THREE.Vector3(i.x, 2.7, i.z)),
        ...orderNoticesRef.current.map(
          ({ order: o }) =>
            new THREE.Vector3(
              HOME_BUSINESSES[o.customerId]?.building[0] ??
                o.position?.[0] ??
                NODES[o.node]?.[0] ??
                4,
              HOME_BUSINESSES[o.customerId] ? 3.1 : 1.65,
              HOME_BUSINESSES[o.customerId]?.building[1] ??
                o.position?.[1] ??
                NODES[o.node]?.[1] ??
                2,
            ),
        ),
      ];
      anchors.forEach((p, i) => {
        const el = labels.current[i];
        if (!el) return;
        const nearby =
          i === 3 ||
          i >= 12 ||
          Math.hypot(
            p.x -
              (s?.brandon.voyage?.courierPosition?.[0] ??
                s?.brandon.position?.[0] ??
                4),
            p.z -
              (s?.brandon.voyage?.courierPosition?.[1] ??
                s?.brandon.position?.[1] ??
                2),
          ) < 4;
        p.project(camera);
        el.style.left = (p.x * 0.5 + 0.5) * host.current.clientWidth + "px";
        el.style.top = (-p.y * 0.5 + 0.5) * host.current.clientHeight + "px";
        el.style.opacity = p.z > 1 || !nearby ? "0" : "1";
        el.style.visibility = p.z > 1 || !nearby ? "hidden" : "visible";
      });
      if (workplaceAnchor.current && s) {
        const origin = s.operations?.origin || "home";
        const anchor =
          origin === "farm_shop"
            ? new THREE.Vector3(FARM.x - 2.65, 3.5, FARM.z)
            : origin === "cafe"
              ? new THREE.Vector3(4, 3.1, -0.25)
              : new THREE.Vector3(
                  HOME_GARAGE.position[0],
                  2.6,
                  HOME_GARAGE.position[1],
                );
        anchor.project(camera);
        const visible =
          anchor.z <= 1 &&
          Math.abs(anchor.x) < 1.15 &&
          Math.abs(anchor.y) < 1.15;
        workplaceAnchor.current.style.left = `${(anchor.x * 0.5 + 0.5) * host.current.clientWidth}px`;
        workplaceAnchor.current.style.top = `${(-anchor.y * 0.5 + 0.5) * host.current.clientHeight}px`;
        workplaceAnchor.current.style.visibility = visible
          ? "visible"
          : "hidden";
        renderer.domElement.dataset.workplaceOrigin = origin;
        renderer.domElement.dataset.warehouseVisit = s.brandon.buildingVisit
          ?.warehouse
          ? s.brandon.buildingVisit.origin + ":" + s.brandon.buildingVisit.phase
          : "none";
      }
      if (shorelineAnchor.current) {
        const anchor = new THREE.Vector3(
          SHORELINE.position[0],
          1.6,
          SHORELINE.position[1],
        ).project(camera);
        shorelineAnchor.current.style.left = `${(anchor.x * 0.5 + 0.5) * host.current.clientWidth}px`;
        shorelineAnchor.current.style.top = `${(-anchor.y * 0.5 + 0.5) * host.current.clientHeight}px`;
        shorelineAnchor.current.style.visibility =
          anchor.z <= 1 && Math.abs(anchor.x) < 1.1 && Math.abs(anchor.y) < 1.1
            ? "visible"
            : "hidden";
      }
      updateCitizens();
      toyShading.update(controls.target);
      renderer.domElement.dataset.detailedFigurines = String(
        updateFigurineDetail(camera, host.current.clientHeight),
      );
      lens.render(controls.target);
      lastFrameCost = performance.now() - frameStart;
      renderer.domElement.dataset.frameInterval = String(
        Math.round(frameInterval),
      );
      renderFrames++;
      renderer.domElement.dataset.renderFrames = String(renderFrames);
      if (renderFrames === 1)
        renderer.domElement.dataset.firstFrameMs = String(
          Math.round(performance.now()),
        );
      renderer.domElement.dataset.drawCalls = String(
        renderer.info.render.calls,
      );
      renderer.domElement.dataset.triangles = String(
        renderer.info.render.triangles,
      );
      frame = requestAnimationFrame(render);
    };
    const syncVisibility = () => {
      if (disposed) return;
      const visible = onScreen && !document.hidden;
      renderer.domElement.dataset.renderingPaused = String(!visible);
      if (!visible) {
        clearCameraKeys();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        previous = performance.now();
        suspended = true;
      } else if (frame === null) {
        if (suspended) {
          // The server keeps simulating while the scene is out of view. Start at
          // its current pose instead of replaying an unseen route in one frame.
          motions.clear();
          shoreMotions.clear();
          live.reset(0);
          frameBus.clear();
          lastFrame = null;
          suspended = false;
        }
        resolution.reset(performance.now());
        lastRenderTime = performance.now();
        previous = performance.now() - frameInterval;
        frame = requestAnimationFrame(render);
      }
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncVisibility();
    });
    visibilityObserver.observe(host.current);
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    const lost = (e) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      observer.disconnect();
      window.removeEventListener("keydown", cameraKeyDown);
      window.removeEventListener("keyup", cameraKeyUp);
      window.removeEventListener("blur", clearCameraKeys);
      document.removeEventListener("focusin", clearCameraKeys);
      controls.dispose();
      vehicleEffects.dispose();
      thunder.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            m.map?.dispose();
            m.dispose();
          }
        }
      });
      toyShading.dispose();
      lens.dispose();
      renderer.dispose();
      renderer.domElement.removeEventListener("pointermove", hoverWorkplace);
      renderer.domElement.removeEventListener("pointerleave", leaveWorkplace);
      renderer.domElement.remove();
    };
  }, [reducedMotion]);
  useEffect(() => {
    if (controller.current) {
      setFollow(false);
      controller.current.clearCameraKeys();
      const scale = Math.max(
        1,
        Math.min(1.6, 1.15 / controller.current.camera.aspect),
      );
      controller.current.camera.position.set(
        26 * scale,
        30 * scale,
        40 * scale,
      );
      controller.current.controls.target.set(4, 0.1, 1);
    }
  }, [viewReset]);
  useEffect(() => {
    const c = controller.current;
    if (follow && c) {
      c.clearCameraKeys();
      c.controls.target.copy(c.subject);
      c.camera.position.copy(c.subject).add(new THREE.Vector3(6, 6, 8));
    }
  }, [follow]);
  useEffect(() => {
    const c = controller.current;
    if (!c) return;
    if (followTarget === "overview") {
      setFollow(false);
      c.camera.position.set(68, 82, 108);
      c.controls.target.set(5, 0.1, 1);
    } else if (followTarget !== "brandon") {
      setFollow(true);
      c.camera.position.copy(c.subject).add(new THREE.Vector3(6, 6, 8));
    }
  }, [followTarget]);
  useEffect(() => {
    const view = controller.current;
    if (!workplacePinned || !view) return;
    const [x, z] =
      workplaceOrigin === "farm_shop"
        ? [FARM.x, FARM.z]
        : workplaceOrigin === "cafe"
          ? [4, -0.25]
          : HOME_GARAGE.position;
    setFollow(false);
    view.controls.target.set(x, 0.1, z);
    const scale = Math.max(1, Math.min(1.6, 1.15 / view.camera.aspect));
    view.camera.position.set(x + 15 * scale, 21 * scale, z + 26 * scale);
    view.controls.update();
  }, [workplacePinned, workplaceOrigin]);
  useEffect(() => {
    const view = controller.current;
    if (!shorelinePinned || !view) return;
    setFollow(false);
    const [x, z] = SHORELINE.position;
    view.controls.target.set(x, 0.4, z);
    view.camera.position.set(x + 8, 10, z + 13);
    view.controls.update();
  }, [shorelinePinned]);
  return (
    <div className="island-canvas" ref={host}>
      {resolutionNotice && (
        <div
          className="resolution-notice"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {resolutionNotice.direction === "lower"
            ? "Resolution lowered for smoother motion"
            : "Resolution raised for sharper detail"}
          <small>
            {resolutionNotice.fps} FPS ·{" "}
            {Math.round(resolutionNotice.scale * 100)}% resolution · aiming for
            60 FPS
          </small>
        </div>
      )}
      {!failed && (
        <div className="map-labels">
          <div
            ref={shorelineAnchor}
            className="shoreline-anchor"
            onPointerEnter={() => setShorelineHovered(true)}
            onPointerLeave={() => setShorelineHovered(false)}
          >
            <button
              className="shoreline-marker"
              aria-label="Shoreline cleanup"
              aria-expanded={shorelineHovered || shorelinePinned}
              aria-controls="shoreline-info"
              onFocus={() => setShorelineHovered(true)}
              onBlur={() => setShorelineHovered(false)}
              onClick={() => setShorelinePinned((value) => !value)}
            >
              ♻ Shoreline cleanup{" "}
              <small>{cleanup.remaining} plastic pieces</small>
            </button>
            <div
              id="shoreline-info"
              className="shoreline-info"
              role="region"
              aria-label="Shoreline cleanup details"
              hidden={!shorelineHovered && !shorelinePinned}
            >
              <b>From ocean litter to useful gadgets</b>
              <p>
                Brandon collects washed-up bottles and plastic fragments, then
                reuses them at the workshop. New litter washes ashore with the
                tide.
              </p>
              <dl>
                <div>
                  <dt>On the shoreline</dt>
                  <dd>{cleanup.remaining} pieces</dd>
                </div>
                <div>
                  <dt>Cleaned up</dt>
                  <dd>{state.shorelineCleaned || 0} pieces</dd>
                </div>
                <div>
                  <dt>Ready to craft</dt>
                  <dd>{state.scrap || 0} pieces</dd>
                </div>
              </dl>
              <small>
                {cleanup.collecting
                  ? `Collecting plastic · ${Math.round(cleanup.progress * 100)}%`
                  : "Collects up to 6 pieces per visit"}
              </small>
            </div>
          </div>
          <div
            ref={workplaceAnchor}
            className={`workplace-anchor${workplacePinned || workplaceHovered ? " is-open" : ""}`}
            data-workplace={workplaceOrigin}
          >
            <button
              className="workplace-marker"
              aria-expanded={workplacePinned || workplaceHovered}
              aria-controls="workplace-stat-panel"
              onPointerEnter={() => setWorkplaceHovered(true)}
              onPointerLeave={() => setWorkplaceHovered(false)}
              onFocus={() => setWorkplaceHovered(true)}
              onBlur={() => setWorkplaceHovered(false)}
              onClick={() => setWorkplacePinned((value) => !value)}
            >
              {workplaceName} <span>⌂</span>
              <small className="workplace-stock-count">
                {state?.cafe || 0} pickle cases
              </small>
            </button>
            <section
              id="workplace-stat-panel"
              className="workplace-stat-panel"
              aria-label={`${workplaceName} statistics`}
              hidden={!workplacePinned && !workplaceHovered}
            >
              <div className="workplace-stats-title">
                {workplaceName}
                <small>
                  {state?.schedule?.phase?.replaceAll("_", " ") ||
                    "Opening day"}
                </small>
              </div>
              <dl>
                <div>
                  <dt>Cash</dt>
                  <dd>{state?.money || 0} coins</dd>
                </div>
                <div>
                  <dt>Ready cases</dt>
                  <dd>{state?.cafe || 0}</dd>
                </div>
                <div>
                  <dt>Delivered today</dt>
                  <dd>{deliveredToday}</dd>
                </div>
                <div>
                  <dt>Team / daily wages</dt>
                  <dd>
                    {state?.crew?.length || 0} / {payroll}
                  </dd>
                </div>
                {workplaceOrigin === "farm_shop" && (
                  <>
                    <div>
                      <dt>Fermenting</dt>
                      <dd>
                        {(state?.production?.fermenting || []).reduce(
                          (sum, batch) => sum + batch.cases,
                          0,
                        )}{" "}
                        cases
                      </dd>
                    </div>
                    <div>
                      <dt>Factory output</dt>
                      <dd>{state?.production?.produced || 0} cases</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
          </div>
          <span ref={(el) => (labels.current[1] = el)} className="map-label">
            Harbor <b>{state?.harbor} crates</b>
          </span>
          <span ref={(el) => (labels.current[2] = el)} className="map-label">
            Workshop <b>{state?.parts ?? 4} parts</b>
          </span>
          <span
            ref={(el) => (labels.current[4] = el)}
            className="map-label district-label"
          >
            Fresh & Local <b>{state?.market ?? 18} pickle cases</b>
          </span>
          <span
            ref={(el) => (labels.current[5] = el)}
            className="map-label district-label"
          >
            Recharge <b>Electric pit stop</b>
          </span>
          <span
            ref={(el) => (labels.current[6] = el)}
            className="map-label district-label"
          >
            Pickle Cay <b>{state?.orchard ?? 12} island pickle cases</b>
          </span>
          {Object.entries(ISLANDS).map(([id, island], i) => (
            <button
              onClick={() => {
                const c = controller.current;
                setFollow(false);
                c.controls.target.set(island.x, 0.1, island.z);
                c.camera.position.set(island.x + 11, 14, island.z + 15);
              }}
              key={id}
              ref={(el) => (labels.current[7 + i] = el)}
              className="map-label island-destination"
            >
              {island.name}
              <b>
                {state.outposts?.[id]
                  ? `${state.outposts[id].stock} cases · open for business`
                  : island.business}
              </b>
            </button>
          ))}
          {showOrderLabels &&
            islandNotices.map((notice, i) => {
              const { order } = notice;
              const delivered =
                notice.fulfilledAt !== null && notice.status !== "pending";
              return (
                <span
                  key={order.id}
                  ref={(el) => (labels.current[12 + i] = el)}
                  className={`order-bubble is-${notice.status}${delivered ? " is-delivered" : ""}`}
                  style={{ "--order-stack": notice.stack }}
                  data-order-id={order.id}
                  data-order-status={notice.status}
                  data-order-customer={order.customerId}
                  aria-label={`${order.name}: ${delivered ? "Order delivered" : "Waiting for delivery"}. ${order.cases || 1} ${(order.cases || 1) === 1 ? "case" : "cases"}. ${order.order}`}
                  title={
                    delivered
                      ? `Delivered by ${order.courier || "the team"}`
                      : order.order
                  }
                >
                  <span aria-hidden="true">{delivered ? "✓" : ""}</span>
                </span>
              );
            })}
          <button
            ref={(el) => (labels.current[3] = el)}
            className="character-label"
            onClick={onSelect}
            aria-label="Inspect Brandon"
          >
            {followTarget === "brandon" || followTarget === "overview"
              ? "Brandon"
              : state?.crew?.find((c) => c.id === followTarget)?.name ||
                "Brandon"}{" "}
            <span>↗</span>
          </button>
        </div>
      )}
      {!failed && (
        <button
          className="workplace-toggle"
          aria-pressed={workplacePinned}
          onClick={() => setWorkplacePinned((value) => !value)}
        >
          ⌂ Workplace stats {workplacePinned ? "on" : "off"}
        </button>
      )}
      {!failed && (
        <button
          className="follow-button"
          title={
            follow
              ? "Explore the world: drag to rotate, WASD or arrow keys to move"
              : "Follow Brandon; WASD or arrow keys move the center in whole-world view"
          }
          aria-pressed={follow}
          onClick={() => {
            if (follow) {
              const c = controller.current;
              c.camera.position.set(26, 30, 40);
              c.controls.target.set(4, 0.1, 1);
            }
            if (!follow) onFollowTargetChange?.("brandon");
            setFollow(!follow);
          }}
        >
          {follow ? "↗ See the whole world" : "◎ Follow Brandon"}
        </button>
      )}
      {failed && (
        <div className="canvas-fallback">
          <h2>The island is in map mode</h2>
          <p>
            3D is unavailable on this device. The mission and all controls still
            work.
          </p>
          <div className="simple-map">
            Harbor{" "}
            <span>⟷ {state?.bridgeClosed ? "Scenic route" : "Bridge"} ⟷</span>{" "}
            Packing room
            <br />↳ Shoreline cleanup · Workshop ↲
          </div>
        </div>
      )}
    </div>
  );
}
