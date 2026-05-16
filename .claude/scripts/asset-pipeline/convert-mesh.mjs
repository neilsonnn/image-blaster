#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { ensureDir, one, parseArgs, pathExists, safeFileName, writeJson } from "./fal-queue.mjs";
import { artifactPath, nextIndex, parseIndexedName } from "./request-metadata.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_FORMATS = ["usdz", "stl"];
const EXPORTER_VERSION = "three-stdlib@2.36.1";

function usage() {
  return "Usage: node convert-mesh.mjs --input <model.glb> --output-dir <dir> [--asset-name <slug>] [--formats usdz,stl,fbx] [--via blender]";
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Exporter returned an unsupported binary payload.");
}

function parseFormats(value) {
  if (!value) return DEFAULT_FORMATS;
  const formats = String(value)
    .split(",")
    .map((format) => format.trim().toLowerCase())
    .filter(Boolean);
  const unsupported = formats.filter((format) => !["usdz", "stl", "fbx"].includes(format));
  if (unsupported.length > 0) throw new Error(`Unsupported format(s): ${unsupported.join(", ")}`);
  return [...new Set(formats)];
}

function requestedFormats(flags) {
  const formats = parseFormats(one(flags, "formats"));
  return flags["with-fbx"] && !formats.includes("fbx") ? [...formats, "fbx"] : formats;
}

async function importFromRootOrApp(packageName, appPath) {
  try {
    return await import(packageName);
  } catch (rootError) {
    try {
      return await import(pathToFileURL(path.resolve(appPath)).href);
    } catch {
      throw new Error(
        `${packageName} is required. Run \`bun install\` at the repo root, or install app dependencies so ${appPath} exists. Original error: ${rootError.message}`
      );
    }
  }
}

async function loadThreeModules() {
  const THREE = await importFromRootOrApp("three", "app/node_modules/three/build/three.module.js");
  const stdlib = await importFromRootOrApp("three-stdlib", "app/node_modules/three-stdlib/index.js");
  return {
    THREE,
    GLTFLoader: stdlib.GLTFLoader,
    STLExporter: stdlib.STLExporter,
    USDZExporter: stdlib.USDZExporter
  };
}

function installNodeImageStub() {
  if (!globalThis.self) globalThis.self = globalThis;
  if (!globalThis.ImageBitmap) {
    globalThis.ImageBitmap = class ImageBitmap {
      constructor() {
        this.width = 1;
        this.height = 1;
      }
      close() {}
    };
  }
  if (!globalThis.createImageBitmap) {
    globalThis.createImageBitmap = async () => new globalThis.ImageBitmap();
  }
}

function normalizeMaterials(scene, THREE) {
  const textureFields = [
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "map",
    "metalnessMap",
    "normalMap",
    "roughnessMap"
  ];

  scene.traverse((object) => {
    if (!object.isMesh) return;
    let material = Array.isArray(object.material) ? object.material.find(Boolean) : object.material;
    if (!material?.isMeshStandardMaterial) {
      material = new THREE.MeshStandardMaterial({ color: material?.color || 0xffffff });
    }
    for (const field of textureFields) material[field] = null;
    material.needsUpdate = true;
    object.material = material;
  });
}

async function loadGlbScene(inputPath, modules) {
  installNodeImageStub();
  const loader = new modules.GLTFLoader();
  const buffer = await readFile(inputPath);
  const resourcePath = `${path.dirname(path.resolve(inputPath))}${path.sep}`;
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(toArrayBuffer(buffer), resourcePath, resolve, reject);
  });
  normalizeMaterials(gltf.scene, modules.THREE);
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function provenancePath(outputDir, index, slug, format) {
  return path.join(outputDir, `.${index}-${safeFileName(slug)}-${format}-request.json`);
}

async function writeProvenance(options) {
  const { format, input, output, provenance, settings } = options;
  await writeJson(provenance, {
    schema_version: 1,
    kind: "mesh-export",
    provider: `image-blast-export/${format}`,
    endpoint: `image-blast-export/${format}`,
    exporter: settings.exporter,
    exporter_version: EXPORTER_VERSION,
    status: "completed",
    input_files: [input],
    output_files: [output],
    settings,
    generated_at: new Date().toISOString()
  });
}

async function exportUsdz(scene, outputPath, USDZExporter) {
  const exporter = new USDZExporter();
  const payload =
    typeof exporter.parseAsync === "function"
      ? await exporter.parseAsync(scene)
      : await exporter.parse(scene);
  await writeFile(outputPath, toBuffer(payload));
}

async function exportStl(scene, outputPath, STLExporter) {
  const payload = new STLExporter().parse(scene, { binary: true });
  await writeFile(outputPath, toBuffer(payload));
}

async function blenderOnPath() {
  try {
    await execFileAsync("which", ["blender"]);
    return true;
  } catch {
    return false;
  }
}

async function exportFbxViaBlender(inputPath, outputPath) {
  const script = [
    "import bpy, os",
    "bpy.ops.object.select_all(action='SELECT')",
    "bpy.ops.object.delete()",
    "bpy.ops.import_scene.gltf(filepath=os.environ['IMAGE_BLASTER_INPUT'])",
    "bpy.ops.export_scene.fbx(filepath=os.environ['IMAGE_BLASTER_OUTPUT'])"
  ].join("; ");
  await execFileAsync("blender", ["--background", "--python-expr", script], {
    env: {
      ...process.env,
      IMAGE_BLASTER_INPUT: path.resolve(inputPath),
      IMAGE_BLASTER_OUTPUT: path.resolve(outputPath)
    },
    maxBuffer: 1024 * 1024 * 10
  });
}

export async function convertMesh(options) {
  const input = options.input;
  const outputDir = options.outputDir;
  if (!input) throw new Error("input is required.");
  if (!outputDir) throw new Error("outputDir is required.");
  if (!(await pathExists(input))) throw new Error(`Input file does not exist: ${input}`);
  if (path.extname(input).toLowerCase() !== ".glb") throw new Error("Input must be a .glb file.");

  await ensureDir(outputDir);
  const parsed = parseIndexedName(input);
  const slug = safeFileName(options.assetName || parsed?.slug || path.basename(input, ".glb").replace(/^\d+-/, ""));
  const index = parsed?.index ?? (await nextIndex(outputDir, slug));
  const formats = Array.isArray(options.formats) ? options.formats : parseFormats(options.formats);
  const needsScene = formats.some((format) => ["usdz", "stl"].includes(format));
  const modules = needsScene ? await loadThreeModules() : undefined;
  const scene = needsScene ? await loadGlbScene(input, modules) : undefined;
  const outputs = [];
  const skipped = [];

  for (const format of formats) {
    if (format === "fbx" && !options.viaBlender) {
      console.error("warning: FBX export requires --via blender; skipping FBX.");
      skipped.push({ format, reason: "requires --via blender" });
      continue;
    }
    if (format === "fbx" && !(await blenderOnPath())) {
      console.error("warning: blender not found on PATH; skipping FBX export.");
      skipped.push({ format, reason: "blender not found on PATH" });
      continue;
    }

    const output = artifactPath(outputDir, index, slug, `.${format}`);
    const provenance = provenancePath(outputDir, index, slug, format);
    if (format === "usdz") await exportUsdz(scene, output, modules.USDZExporter);
    if (format === "stl") await exportStl(scene, output, modules.STLExporter);
    if (format === "fbx") await exportFbxViaBlender(input, output);
    const settings = {
      format,
      exporter: format === "fbx" ? "blender" : `three-stdlib/${format.toUpperCase()}Exporter`,
      via: format === "fbx" ? "blender" : "node",
      binary: format === "stl" ? true : undefined,
      textures: false
    };
    await writeProvenance({ format, input, output, provenance, settings });
    outputs.push({ format, path: output, provenance });
  }

  return {
    schema_version: 1,
    input,
    output_dir: outputDir,
    asset_name: slug,
    index,
    outputs,
    skipped
  };
}

async function main() {
  const { flags } = parseArgs();
  const input = one(flags, "input");
  const outputDir = one(flags, "output-dir");
  if (!input || !outputDir) throw new Error(usage());
  const summary = await convertMesh({
    input,
    outputDir,
    assetName: one(flags, "asset-name"),
    formats: requestedFormats(flags),
    viaBlender: one(flags, "via") === "blender" || Boolean(flags.blender)
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
