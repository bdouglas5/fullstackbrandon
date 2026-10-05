import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// One shared ocean material: small vertex waves + analytic glints, no textures.
export function animateOcean(ocean) {
  const time = { value: 0 },
    storm = { value: 0 };
  ocean.material.onBeforeCompile = (shader) => {
    shader.uniforms.waveTime = time;
    shader.uniforms.storm = storm;
    shader.vertexShader =
      "uniform float waveTime; uniform float storm; varying vec2 waterUV;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      waterUV=position.xy;
      transformed.z += (sin(position.x * 1.3 + waveTime * 1.1) * cos(position.y * .7 + waveTime * .5)) * (.035 + storm * .055);`,
    );
    shader.fragmentShader =
      "uniform float waveTime; uniform float storm; varying vec2 waterUV;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float ripple=sin(waterUV.x * 3.4 + waveTime * 1.6 + sin(waterUV.y * 1.8 - waveTime));
      float crest=smoothstep(.92,1.,ripple)*smoothstep(.45,.95,sin(waterUV.y*2.7+waterUV.x*.3));
      diffuseColor.rgb += vec3(.11,.18,.17) * crest * (.5+storm*.5);
      diffuseColor.rgb *= .96 + .04 * sin(waterUV.x*.5+waterUV.y*.4+waveTime*.4);`,
    );
  };
  ocean.material.customProgramCacheKey = () => "brine-ocean-v1";
  return { time, storm };
}
export function createWorldLens(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  // Canvas antialiasing does not apply to the composer's offscreen scene.
  // Resolve multisampled geometry before applying the miniature lens.
  const samples = Math.min(4, renderer.capabilities.maxSamples);
  composer.renderTarget1.samples = samples;
  composer.renderTarget2.samples = samples;
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(640, 400),
    0.035,
    0.55,
    1.15,
  );
  // Soft emissive spill is resolved below scene resolution to keep the lens
  // affordable at Retina sizes. The in-focus geometry retains full resolution.
  const resizeBloom = bloom.setSize.bind(bloom);
  bloom.setSize = (width, height) => {
    const scale = Math.min(0.5, 960 / Math.max(width, height));
    resizeBloom(Math.max(1, width * scale), Math.max(1, height * scale));
  };
  composer.addPass(bloom);
  const makeBlur = (x, y) =>
    new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1000, 700) },
        direction: { value: new THREE.Vector2(x, y) },
        focus: { value: new THREE.Vector2(0.5, 0.5) },
      },
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution;
      uniform vec2 direction; uniform vec2 focus; varying vec2 vUv;
      void main(){
        // A narrow, slightly tilted focus plane remains at every zoom level.
        // Blur is measured against viewport height, so retina displays keep
        // the same miniature appearance without making the focal strip soft.
        float distanceToPlane=abs(vUv.y-focus.y+(vUv.x-focus.x)*.075);
        float blur=smoothstep(.055,.40,distanceToPlane);
        vec2 stepUV=direction/resolution*(resolution.y*.0028*blur);
        vec4 c=vec4(0.);
        float total=0.;
        // Enough overlapping taps to soften fine rails and branches instead
        // of showing separated ghost edges at the strongest blur setting.
        for(int i=-6;i<=6;i++){
          float offset=float(i);
          float weight=exp(-offset*offset/12.5);
          c+=texture2D(tDiffuse,vUv+stepUV*offset)*weight;
          total+=weight;
        }
        gl_FragColor=c/total;
      }`,
    });
  const horizontal = makeBlur(1, 0),
    vertical = makeBlur(0, 1);
  composer.addPass(horizontal);
  composer.addPass(vertical);
  // Color grade in linear light before tone mapping: white balance,
  // saturation, contrast around mid grey, and a soft lens vignette.
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uWarmth: { value: 0 },
      uSaturation: { value: 1.1 },
      uContrast: { value: 1.05 },
      uExposure: { value: 1 },
      uVignette: { value: 0.22 },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarmth, uSaturation, uContrast, uExposure, uVignette;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb * uExposure;
        // Warm: lift reds, trim blues. Cool (negative): the reverse.
        col *= vec3(1.0 + uWarmth * 0.14, 1.0 + uWarmth * 0.03, 1.0 - uWarmth * 0.16);
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(luma), col, uSaturation);
        col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);
        vec2 d = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
        gl_FragColor = vec4(col, c.a);
      }`,
  });
  composer.addPass(grade);
  const output = new OutputPass();
  composer.addPass(output);
  renderer.info.autoReset = false;
  let width = 0,
    height = 0,
    pixelRatio = 0;
  const size = new THREE.Vector2(),
    focusPoint = new THREE.Vector3();
  return {
    setNight(strength, golden = 0) {
      bloom.strength = 0.035 + strength * 0.38 + golden * 0.08;
      renderer.domElement.dataset.bloomStrength = String(bloom.strength);
    },
    setGrade({ warmth = 0, saturation = 1, contrast = 1, exposure = 1 } = {}) {
      grade.uniforms.uWarmth.value = warmth;
      grade.uniforms.uSaturation.value = saturation;
      grade.uniforms.uContrast.value = contrast;
      grade.uniforms.uExposure.value = exposure;
    },
    render(target) {
      renderer.getSize(size);
      if (
        size.x !== width ||
        size.y !== height ||
        pixelRatio !== renderer.getPixelRatio()
      ) {
        width = size.x;
        height = size.y;
        pixelRatio = renderer.getPixelRatio();
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
        for (const pass of [horizontal, vertical])
          pass.uniforms.resolution.value.set(
            width * renderer.getPixelRatio(),
            height * renderer.getPixelRatio(),
          );
      }
      if (target) {
        focusPoint.copy(target).project(camera);
        for (const pass of [horizontal, vertical])
          pass.uniforms.focus.value.set(
            focusPoint.x * 0.5 + 0.5,
            THREE.MathUtils.clamp(focusPoint.y * 0.5 + 0.5, 0.25, 0.75),
          );
      }
      renderer.domElement.dataset.tiltShift = "always-on";
      renderer.domElement.dataset.antialiasSamples = String(samples);
      renderer.info.reset();
      composer.render();
    },
    dispose() {
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
    },
  };
}
