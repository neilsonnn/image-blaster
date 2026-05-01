#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  ensureDir,
  inferMime,
  isUrl,
  many,
  one,
  parseArgs,
  pathExists,
  readJson,
  requireEnv,
  writeJson
} from "../asset-pipeline/fal-queue.mjs";
import { isVisibleFile, parseIndexedName } from "../asset-pipeline/request-metadata.mjs";

const ENDPOINT = "https://api.worldlabs.ai/marble/v1";
const MODEL = "marble-1.1";
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripBase64(value) {
  if (Array.isArray(value)) return value.map(stripBase64);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "data_base64" ? "[stripped]" : stripBase64(child)
    ])
  );
}

async function readJsonIfExists(filePath) {
  return (await pathExists(filePath)) ? readJson(filePath) : undefined;
}

async function latestSourceImage(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const images = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name))
    .filter((filePath) => isVisibleFile(filePath) && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => parseIndexedName(filePath) || { index: 0, path: filePath, slug: path.basename(filePath) });

  return images.sort((a, b) => b.index - a.index || a.slug.localeCompare(b.slug))[0]?.path;
}

async function promptFromImageJson(world) {
  const imageJson = await readJsonIfExists(`worlds/${world}/image.json`);
  if (!imageJson) return undefined;

  return [
    imageJson.scene_name,
    imageJson.short_caption,
    imageJson.literal_description,
    imageJson.environment,
    imageJson.visual_style,
    imageJson.lighting,
    imageJson.atmosphere
  ]
    .filter(Boolean)
    .join("\n");
}

async function imagePrompt(image, textPrompt) {
  if (isUrl(image)) {
    return {
      type: "image",
      image_prompt: {
        source: "uri",
        uri: image
      },
      ...(textPrompt ? { text_prompt: textPrompt } : {})
    };
  }

  const data = await readFile(image);
  const extension = path.extname(image).replace(/^\./, "") || "png";
  return {
    type: "image",
    image_prompt: {
      source: "data_base64",
      data_base64: data.toString("base64"),
      extension,
      mime_type: inferMime(image)
    },
    ...(textPrompt ? { text_prompt: textPrompt } : {})
  };
}

async function buildRequest({ world, image, prompt }) {
  const textPrompt = prompt || await promptFromImageJson(world);
  if (image) {
    return {
      display_name: world,
      model: MODEL,
      world_prompt: await imagePrompt(image, textPrompt)
    };
  }

  if (!textPrompt) {
    throw new Error("World generation requires a source image, prompt, or worlds/<world>/image.json.");
  }

  return {
    display_name: world,
    model: MODEL,
    world_prompt: {
      type: "text",
      text_prompt: textPrompt
    }
  };
}

async function submitWorld(request, operationPath) {
  const apiKey = await requireEnv("WORLD_LABS_API_KEY");
  const response = await fetch(`${ENDPOINT}/worlds:generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "WLT-Api-Key": apiKey
    },
    body: JSON.stringify(request)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`World Labs submit failed (${response.status}): ${JSON.stringify(stripBase64(body))}`);
  }

  await writeJson(operationPath, stripBase64(body));
  return body;
}

function operationId(operation) {
  const id = operation?.operation_id || operation?.id || operation?.name;
  if (!id) throw new Error(`World Labs operation did not include operation_id: ${JSON.stringify(operation)}`);
  return String(id).split("/").at(-1);
}

async function pollOperation(operation, operationPath, pollIntervalMs) {
  const apiKey = await requireEnv("WORLD_LABS_API_KEY");
  let current = operation;
  const id = operationId(current);

  while (!current.done) {
    await sleep(pollIntervalMs);
    const response = await fetch(`${ENDPOINT}/operations/${id}`, {
      headers: {
        "WLT-Api-Key": apiKey
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`World Labs poll failed (${response.status}): ${JSON.stringify(stripBase64(body))}`);
    }
    current = body;
    await writeJson(operationPath, stripBase64(current));
  }

  return current;
}

export async function generateWorld(options) {
  const {
    world,
    image,
    prompt,
    regenerate = false,
    pollIntervalMs = 15000
  } = options;

  if (!world) throw new Error("world is required.");

  const outputDir = `worlds/${world}/output/world`;
  const operationPath = path.join(outputDir, "operation.json");
  const worldPath = path.join(outputDir, "world.json");
  await ensureDir(outputDir);

  if ((await pathExists(worldPath)) && !regenerate) {
    return {
      world,
      skipped: true,
      skip_reason: "world.json already exists. Pass --regenerate to create a new world.",
      world_json: worldPath,
      operation_json: operationPath
    };
  }

  const existingOperation = regenerate ? undefined : await readJsonIfExists(operationPath);
  const operation = existingOperation && !existingOperation.done
    ? existingOperation
    : await submitWorld(await buildRequest({ world, image, prompt }), operationPath);

  const completed = await pollOperation(operation, operationPath, Number(pollIntervalMs));

  if (completed.error) {
    throw new Error(`World Labs generation failed: ${JSON.stringify(completed.error)}`);
  }
  if (!completed.response) {
    throw new Error(`World Labs operation completed without response: ${JSON.stringify(completed)}`);
  }

  await writeJson(worldPath, completed.response);

  return {
    world,
    operation_id: operationId(completed),
    operation_json: operationPath,
    world_json: worldPath,
    route: `/${world}`
  };
}

async function main() {
  const { flags } = parseArgs();
  const world = one(flags, "world");
  if (!world) {
    throw new Error("Usage: node generate-world.mjs --world <world-name> [--image <path-or-url>] [--prompt <text>] [--regenerate]");
  }

  const prompt = [...many(flags, "prompt"), ...many(flags, "description")].join("\n").trim() || undefined;
  const explicitImage = one(flags, "image");
  const image = explicitImage || await latestSourceImage(`worlds/${world}/source`);

  const result = await generateWorld({
    world,
    image,
    prompt,
    regenerate: Boolean(flags.regenerate),
    pollIntervalMs: one(flags, "poll-interval-ms", 15000)
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
