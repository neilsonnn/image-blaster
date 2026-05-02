#!/usr/bin/env node
import path from "node:path";
import {
  callFalQueue,
  downloadRemoteFiles,
  ensureDir,
  one,
  parseArgs,
  toModelInputUrl,
  writeJson
} from "./fal-queue.mjs";
import { buildRequestSummary, requestPath } from "./request-metadata.mjs";

const ENDPOINT = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
export const DEFAULT_HUNYUAN_FACE_COUNT = 60000;
export const DEFAULT_HUNYUAN_ENABLE_PBR = true;
export const DEFAULT_HUNYUAN_GENERATE_TYPE = "Normal";

const MIN_FACE_COUNT = 40000;
const MAX_FACE_COUNT = 1500000;
const GENERATE_TYPES = new Map([
  ["normal", "Normal"],
  ["lowpoly", "LowPoly"],
  ["geometry", "Geometry"]
]);

function normalizeFaceCount(value) {
  const faceCount = Number(value);
  if (!Number.isInteger(faceCount) || faceCount < MIN_FACE_COUNT || faceCount > MAX_FACE_COUNT) {
    throw new Error(
      `face-count must be an integer between ${MIN_FACE_COUNT} and ${MAX_FACE_COUNT}.`
    );
  }
  return faceCount;
}

function normalizeGenerateType(value) {
  const normalized = GENERATE_TYPES.get(String(value).trim().toLowerCase());
  if (!normalized) {
    throw new Error("generate-type must be one of: Normal, LowPoly, Geometry.");
  }
  return normalized;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error("enable-pbr must be true or false.");
}

export async function runHunyuan3D(options) {
  const {
    image,
    outputDir,
    assetName,
    faceCount = DEFAULT_HUNYUAN_FACE_COUNT,
    enablePbr = DEFAULT_HUNYUAN_ENABLE_PBR,
    generateType = DEFAULT_HUNYUAN_GENERATE_TYPE,
    metadataPath,
    metadata = {},
    onSubmit,
    onStatus
  } = options;

  if (!image) throw new Error("Input image is required.");
  if (!outputDir) throw new Error("outputDir is required.");

  await ensureDir(outputDir);
  const inputImageUrl = await toModelInputUrl(image);
  const normalizedFaceCount = normalizeFaceCount(faceCount);
  const normalizedGenerateType = normalizeGenerateType(generateType);
  const normalizedEnablePbr = normalizeBoolean(enablePbr);

  const input = {
    input_image_url: inputImageUrl,
    generate_type: normalizedGenerateType,
    enable_pbr: normalizedEnablePbr,
    face_count: normalizedFaceCount
  };

  const result = await callFalQueue(ENDPOINT, input, {
    metadataPath: metadataPath || requestPath(outputDir, 0, "hunyuan-3d"),
    metadata: { kind: "3d", provider: ENDPOINT, input, ...metadata },
    pollIntervalMs: 10000,
    onSubmit,
    onStatus
  });

  const downloaded = await downloadRemoteFiles(result.data, outputDir, "hunyuan-3d");
  const summary = buildRequestSummary({
    kind: "3d",
    provider: ENDPOINT,
    metadata,
    requestId: result.requestId,
    submittedAt: result.submittedAt,
    inputFiles: [image],
    outputFiles: downloaded.map((file) => file.path),
    downloadedFiles: downloaded,
    result: result.data,
    extra: { asset_name: assetName, input }
  });

  await writeJson(metadataPath || requestPath(outputDir, 0, "hunyuan-3d"), summary);
  return summary;
}

async function main() {
  const { flags } = parseArgs();
  const image = one(flags, "image") || one(flags, "input-image");
  const outputDir = one(flags, "output-dir");

  if (!image || !outputDir) {
    throw new Error(
      "Usage: node hunyuan-3d.mjs --image <path-or-url> --output-dir <dir> [--asset-name <name>] [--face-count <40000-1500000>] [--generate-type Normal|LowPoly|Geometry] [--enable-pbr true|false]"
    );
  }

  const summary = await runHunyuan3D({
    image,
    outputDir,
    assetName: one(flags, "asset-name"),
    faceCount: one(flags, "face-count", DEFAULT_HUNYUAN_FACE_COUNT),
    enablePbr: one(flags, "enable-pbr", DEFAULT_HUNYUAN_ENABLE_PBR),
    generateType: one(flags, "generate-type", DEFAULT_HUNYUAN_GENERATE_TYPE)
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
