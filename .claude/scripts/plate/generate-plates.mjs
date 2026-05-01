#!/usr/bin/env node
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import { runImageEdit } from "../asset-pipeline/image-edit.mjs";
import {
  ensureDir,
  many,
  one,
  parseArgs,
  pathExists,
  readJson,
  slugify,
  writeJson
} from "../asset-pipeline/fal-queue.mjs";
import {
  artifactPath,
  isVisibleFile,
  latestIndexed,
  nextIndex,
  parseIndexedName,
  requestPath
} from "../asset-pipeline/request-metadata.mjs";

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"]);
const RESERVED_OUTPUT_DIRS = new Set(["world", "sfx"]);

async function readJsonIfExists(filePath) {
  return (await pathExists(filePath)) ? readJson(filePath) : undefined;
}

function isImageFile(filePath) {
  return isVisibleFile(filePath) && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function sourceFamily(filePath) {
  const parsed = parseIndexedName(filePath);
  if (parsed && !parsed.hidden) return parsed;

  const extension = path.extname(filePath);
  return {
    index: 0,
    slug: slugify(path.basename(filePath, extension)),
    extension,
    hidden: false,
    name: path.basename(filePath),
    path: filePath
  };
}

async function sourceImageFiles(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name))
    .filter(isImageFile);
}

async function latestSourceFamilies(sourceDir) {
  const files = await sourceImageFiles(sourceDir);
  const families = new Map();

  for (const file of files) {
    const family = sourceFamily(file);
    const current = families.get(family.slug);
    if (!current || family.index > current.index) {
      families.set(family.slug, family);
    }
  }

  return [...families.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

async function resolveSourceSelection(sourceDir, image) {
  const families = await latestSourceFamilies(sourceDir);
  if (!image) return families;

  const explicitPath = (await pathExists(image)) ? image : undefined;
  if (explicitPath) return [sourceFamily(explicitPath)];

  const wanted = slugify(path.basename(image, path.extname(image)));
  const match = families.find((family) => family.slug === wanted || family.name === image);
  if (!match) throw new Error(`Source image not found: ${image}`);
  return [match];
}

async function intendedObjects(worldDir) {
  const outputDir = path.join(worldDir, "output");
  const entries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const objects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || RESERVED_OUTPUT_DIRS.has(entry.name)) continue;

    const objectDir = path.join(outputDir, entry.name);
    const objectJsonPath = path.join(objectDir, "object.json");
    const objectJson = await readJsonIfExists(objectJsonPath);
    if (!objectJson) continue;

    const object = objectJson.object || objectJson;

    objects.push({
      id: object.id || entry.name,
      name: object.name || entry.name,
      object_json: objectJsonPath
    });
  }

  return objects.sort((a, b) => a.id.localeCompare(b.id));
}

function firstGeneratedImage(imageEditSummary) {
  return (imageEditSummary.downloaded_files || []).find((downloaded) => {
    const contentType = downloaded.source?.content_type || "";
    return contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(downloaded.path);
  });
}

function buildPlatePrompt(objectNames, extraRemovals) {
  const removals = [...objectNames];
  if (extraRemovals.length > 0) removals.push(...extraRemovals);
  if (removals.length === 0) {
    throw new Error("No confirmed object intents or extra removal instructions were found.");
  }
  return `remove the following objects from the image: ${removals.join(", ")}`;
}

export async function generatePlates(options) {
  const {
    world,
    image,
    extraRemovals = [],
    imageEditProvider
  } = options;

  if (!world) throw new Error("world is required.");

  const worldDir = path.join("worlds", world);
  const sourceDir = path.join(worldDir, "source");
  await ensureDir(sourceDir);

  const objects = await intendedObjects(worldDir);
  const objectNames = objects.map((object) => object.name);
  const prompt = buildPlatePrompt(objectNames, extraRemovals);
  const selectedSources = await resolveSourceSelection(sourceDir, image);
  if (selectedSources.length === 0) throw new Error(`No source images found in ${sourceDir}.`);

  const results = [];
  for (const source of selectedSources) {
    const latest = (await latestIndexed(await sourceImageFiles(sourceDir), source.slug)) || source;
    const inputImage = latest.path;
    const outputIndex = Math.max(await nextIndex(sourceDir, source.slug), latest.index + 1);
    const outputPath = artifactPath(sourceDir, outputIndex, source.slug, ".png");
    const metadataPath = requestPath(sourceDir, outputIndex, source.slug);

    const imageEdit = await runImageEdit({
      provider: imageEditProvider,
      prompt,
      images: [inputImage],
      outputDir: sourceDir,
      metadataPath,
      metadata: {
        index: outputIndex,
        role: "plate",
        source_family: source.slug,
        input_image: inputImage,
        removed_objects: objectNames,
        extra_removals: extraRemovals
      },
      numImages: 1,
      outputFormat: "png"
    });

    const rawGeneratedImage = firstGeneratedImage(imageEdit);
    if (!rawGeneratedImage) {
      throw new Error(`Image edit did not return a downloadable plate image for ${source.slug}.`);
    }

    if (rawGeneratedImage.path !== outputPath) {
      await rename(rawGeneratedImage.path, outputPath);
    }

    const metadata = await readJsonIfExists(metadataPath);
    await writeJson(metadataPath, {
      ...metadata,
      output_files: [outputPath],
      downloaded_files: (imageEdit.downloaded_files || []).map((file) =>
        file.path === rawGeneratedImage.path ? { ...file, path: outputPath } : file
      ),
      updated_at: new Date().toISOString()
    });

    results.push({
      source_family: source.slug,
      input_image: inputImage,
      output_image: outputPath,
      request_metadata: metadataPath
    });
  }

  return {
    schema_version: 1,
    world,
    prompt,
    removed_objects: objectNames,
    extra_removals: extraRemovals,
    results
  };
}

async function main() {
  const { flags, positionals } = parseArgs();
  const world = one(flags, "world") || positionals[0];
  const positionalRemovals = world === positionals[0] ? positionals.slice(1).join(" ") : positionals.join(" ");
  const extraRemovals = [
    ...many(flags, "remove"),
    one(flags, "extra-remove"),
    positionalRemovals
  ].filter(Boolean);

  const result = await generatePlates({
    world,
    image: one(flags, "image"),
    extraRemovals,
    imageEditProvider: one(flags, "image-edit-provider")
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
