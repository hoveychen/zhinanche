// Copies the browser files we need from node_modules into vendor/ so the site
// runs with no build step (same approach as leibniz-stepped-reckoner).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * The page's icons (js/app/icons.js): Tabler Icons, outline set, one line
 * weight. Only these are copied, into one small module of their markup.
 */
export const ICONS = [
  "player-pause-filled", "player-play-filled", "link", "check", "zoom-in", "zoom-out", "pencil",
  "arrow-big-up", "arrow-big-down", "arrow-big-left", "arrow-big-right",
  "arrows-horizontal", "arrow-down", "arrow-right", "chevron-left", "chevron-right", "chevron-down",
  "eye", "language", "tool", "repeat", "walk", "arrow-back-up",
];

/**
 * The inner markup of one Tabler icon, without its invisible bounding square
 * ("…-filled": from the filled set, drawn as a shape, css .icon.filled).
 * @param {string} name
 */
function iconMarkup(name) {
  const filled = name.endsWith("-filled");
  const file = join(root, "node_modules/@tabler/icons/icons", filled ? "filled" : "outline", `${name.replace(/-filled$/, "")}.svg`);
  const svg = readFileSync(file, "utf8");
  return [...svg.matchAll(/<(path|circle|rect|line|polyline|ellipse)\b[^>]*\/>/g)]
    .map((m) => m[0])
    .filter((el) => !el.includes('stroke="none"'))
    .join("")
    .replace(/\s+\/>/g, "/>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(join(root, "vendor"), { recursive: true, force: true });
  for (const [from, to] of FILES) {
    const dst = join(root, "vendor", to);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(join(root, "node_modules", from), dst);
  }
  const tabler = JSON.parse(readFileSync(join(root, "node_modules/@tabler/icons/package.json"), "utf8")).version;
  mkdirSync(join(root, "vendor/tabler-icons"), { recursive: true });
  cpSync(join(root, "node_modules/@tabler/icons/LICENSE"), join(root, "vendor/tabler-icons/LICENSE"));
  const lines = ICONS.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(iconMarkup(n))},`);
  writeFileSync(join(root, "vendor/tabler-icons/icons.js"),
    `// Tabler Icons ${tabler} (MIT, see LICENSE here), outline set (and two filled): each icon's markup\n` +
    `// for <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">.\n` +
    `// Generated by tools/vendor.mjs (pnpm vendor); do not edit.\n` +
    `export const ICONS = {\n${lines.join("\n")}\n};\n`);
  console.log(`vendored ${FILES.length} files and ${ICONS.length} icons`);
}
