import { writeFileSync, mkdirSync } from "node:fs";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildWorld } from "../src/world.js";
// GLTFExporter uses browser FileReader; Node supplies Blob but needs this small adapter.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const assets = buildWorld();
assets.brandon.position.set(4, 0.43, 2);
assets.world.updateMatrixWorld(true);
mkdirSync("public/models", { recursive: true });
const exporter = new GLTFExporter();
for (const [name, object] of [
  ["island", assets.world],
  ["fullstack-brandon", assets.brandon.clone()],
  ["brandon-van", assets.van.clone()],
  ["brandon-bike", assets.bike.clone()],
  ["brandon-rocket_skates", assets.rocketSkates.clone()],
  ["brandon-helicopter", assets.helicopter.clone()],
  ["sailboat", assets.boat.clone()],
  ["brandon-jetpack", assets.jetpack.clone()],
  ["brandon-teleporter", assets.teleporter.clone()],
  ...Object.entries(assets.gadgetModels).map(([id, object]) => {
    const model = object.clone();
    model.visible = true;
    model.position.set(0, 0, 0);
    return [`gadget-${id}`, model];
  }),
]) {
  if (name === "fullstack-brandon") {
    object.position.set(0, 0, 0);
    object.updateMatrixWorld(true);
  }
  if (name === "brandon-rocket_skates") object.visible = true;
  const glb = await exporter.parseAsync(object, {
    binary: true,
    onlyVisible: true,
  });
  writeFileSync(`public/models/${name}.glb`, Buffer.from(glb));
  console.log(`${name}.glb: ${Math.round(glb.byteLength / 1024)} KiB`);
}
