// Copies the browser files we need from node_modules into vendor/ so the site
// runs with no build step (same approach as leibniz-stepped-reckoner).
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** @type {[string, string][]} [from node_modules, to vendor] */
export const FILES = [
  ["three/build/three.module.js", "three/build/three.module.js"],
  ["three/build/three.core.js", "three/build/three.core.js"],
  ["three/LICENSE", "three/LICENSE"],
  ["three/examples/jsm/controls/OrbitControls.js", "three/examples/jsm/controls/OrbitControls.js"],
  ["three/examples/jsm/loaders/GLTFLoader.js", "three/examples/jsm/loaders/GLTFLoader.js"],
  ["three/examples/jsm/utils/BufferGeometryUtils.js", "three/examples/jsm/utils/BufferGeometryUtils.js"],
  ["three/examples/jsm/utils/SkeletonUtils.js", "three/examples/jsm/utils/SkeletonUtils.js"],
  ["three/examples/jsm/lines/Line2.js", "three/examples/jsm/lines/Line2.js"],
  ["three/examples/jsm/lines/LineSegments2.js", "three/examples/jsm/lines/LineSegments2.js"],
  ["three/examples/jsm/lines/LineGeometry.js", "three/examples/jsm/lines/LineGeometry.js"],
  ["three/examples/jsm/lines/LineSegmentsGeometry.js", "three/examples/jsm/lines/LineSegmentsGeometry.js"],
  ["three/examples/jsm/lines/LineMaterial.js", "three/examples/jsm/lines/LineMaterial.js"],
  // post-processing for the "high" quality tier (js/scene/postfx.js, loaded lazily)
  ["three/examples/jsm/postprocessing/EffectComposer.js", "three/examples/jsm/postprocessing/EffectComposer.js"],
  ["three/examples/jsm/postprocessing/RenderPass.js", "three/examples/jsm/postprocessing/RenderPass.js"],
  ["three/examples/jsm/postprocessing/OutputPass.js", "three/examples/jsm/postprocessing/OutputPass.js"],
  ["three/examples/jsm/postprocessing/ShaderPass.js", "three/examples/jsm/postprocessing/ShaderPass.js"],
  ["three/examples/jsm/postprocessing/Pass.js", "three/examples/jsm/postprocessing/Pass.js"],
  ["three/examples/jsm/postprocessing/MaskPass.js", "three/examples/jsm/postprocessing/MaskPass.js"],
  ["three/examples/jsm/postprocessing/UnrealBloomPass.js", "three/examples/jsm/postprocessing/UnrealBloomPass.js"],
  ["three/examples/jsm/postprocessing/GTAOPass.js", "three/examples/jsm/postprocessing/GTAOPass.js"],
  ["three/examples/jsm/postprocessing/BokehPass.js", "three/examples/jsm/postprocessing/BokehPass.js"],
  ["three/examples/jsm/shaders/CopyShader.js", "three/examples/jsm/shaders/CopyShader.js"],
  ["three/examples/jsm/shaders/OutputShader.js", "three/examples/jsm/shaders/OutputShader.js"],
  ["three/examples/jsm/shaders/LuminosityHighPassShader.js", "three/examples/jsm/shaders/LuminosityHighPassShader.js"],
  ["three/examples/jsm/shaders/GTAOShader.js", "three/examples/jsm/shaders/GTAOShader.js"],
  ["three/examples/jsm/shaders/PoissonDenoiseShader.js", "three/examples/jsm/shaders/PoissonDenoiseShader.js"],
  ["three/examples/jsm/shaders/BokehShader.js", "three/examples/jsm/shaders/BokehShader.js"],
  ["three/examples/jsm/math/SimplexNoise.js", "three/examples/jsm/math/SimplexNoise.js"],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(join(root, "vendor"), { recursive: true, force: true });
  for (const [from, to] of FILES) {
    const dst = join(root, "vendor", to);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(join(root, "node_modules", from), dst);
  }
  console.log(`vendored ${FILES.length} files`);
}
