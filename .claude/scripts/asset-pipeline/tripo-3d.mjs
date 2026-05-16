#!/usr/bin/env node
import { one, parseArgs } from "./fal-queue.mjs";
import { runFalImageTo3DProvider } from "./fal-3d-provider.mjs";

export const TRIPO_3D_ENDPOINT = "tripo3d/tripo/v2.5/image-to-3d";
export const TRIPO_3D_PROVIDER = "tripo";
export const DEFAULT_TRIPO_TEXTURE = "standard";
export const DEFAULT_TRIPO_PBR = true;
export const DEFAULT_TRIPO_FACE_LIMIT = 30000;
export const DEFAULT_TRIPO_QUAD = false;
export const DEFAULT_TRIPO_AUTO_SIZE = true;
export const DEFAULT_TRIPO_TEXTURE_ALIGNMENT = "original_image";
export const DEFAULT_TRIPO_ORIENTATION = "default";

function normalizeBoolean(value, fieldName) {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`${fieldName} must be true or false.`);
}

function normalizeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${fieldName} must be an integer.`);
  return number;
}

function normalizePositiveInteger(value, fieldName) {
  const number = normalizeInteger(value, fieldName);
  if (number <= 0) throw new Error(`${fieldName} must be greater than 0.`);
  return number;
}

function normalizeNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a number.`);
  return number;
}

export function buildTripo3DInput(options = {}) {
  const input = {
    texture: options.texture || DEFAULT_TRIPO_TEXTURE,
    pbr: normalizeBoolean(options.pbr ?? DEFAULT_TRIPO_PBR, "pbr"),
    face_limit: normalizePositiveInteger(
      options.faceLimit ?? DEFAULT_TRIPO_FACE_LIMIT,
      "face-limit"
    ),
    quad: normalizeBoolean(options.quad ?? DEFAULT_TRIPO_QUAD, "quad"),
    auto_size: normalizeBoolean(options.autoSize ?? DEFAULT_TRIPO_AUTO_SIZE, "auto-size"),
    texture_alignment: options.textureAlignment || DEFAULT_TRIPO_TEXTURE_ALIGNMENT,
    orientation: options.orientation || DEFAULT_TRIPO_ORIENTATION
  };

  if (options.seed !== undefined) {
    input.seed = normalizeInteger(options.seed, "seed");
  }
  if (options.textureSeed !== undefined) {
    input.texture_seed = normalizeInteger(options.textureSeed, "texture-seed");
  }

  return input;
}

export async function runTripo3D(options) {
  const {
    image,
    outputDir,
    assetName,
    metadataPath,
    metadata = {},
    onSubmit,
    onStatus
  } = options;

  if (!image) throw new Error("Input image is required.");
  if (!outputDir) throw new Error("outputDir is required.");

  return runFalImageTo3DProvider({
    endpoint: TRIPO_3D_ENDPOINT,
    providerSlug: TRIPO_3D_PROVIDER,
    imageInputKey: "image_url",
    image,
    outputDir,
    assetName,
    input: buildTripo3DInput(options),
    metadataPath,
    metadata,
    pollIntervalMs: 10000,
    onSubmit,
    onStatus
  });
}

async function main() {
  const { flags } = parseArgs();
  const image = one(flags, "image") || one(flags, "input-image");
  const outputDir = one(flags, "output-dir");

  if (!image || !outputDir) {
    throw new Error(
      "Usage: node tripo-3d.mjs --image <path-or-url> --output-dir <dir> [--asset-name <name>] [--texture no|standard|HD] [--pbr true|false] [--face-limit 30000]"
    );
  }

  const summary = await runTripo3D({
    image,
    outputDir,
    assetName: one(flags, "asset-name"),
    texture: one(flags, "texture", DEFAULT_TRIPO_TEXTURE),
    pbr: one(flags, "pbr", DEFAULT_TRIPO_PBR),
    faceLimit: one(flags, "face-limit", DEFAULT_TRIPO_FACE_LIMIT),
    quad: one(flags, "quad", DEFAULT_TRIPO_QUAD),
    autoSize: one(flags, "auto-size", DEFAULT_TRIPO_AUTO_SIZE),
    textureAlignment: one(flags, "texture-alignment", DEFAULT_TRIPO_TEXTURE_ALIGNMENT),
    orientation: one(flags, "orientation", DEFAULT_TRIPO_ORIENTATION),
    seed: one(flags, "seed"),
    textureSeed: one(flags, "texture-seed")
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
