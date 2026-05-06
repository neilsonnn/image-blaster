---
name: image-blast-world
description: Generate the 3D static environment of a world after previewing the source or plate image with the user.
argument-hint: [world-name] [optional image path or world prompt]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/show-path.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/world/generate-world.mjs *)
context: fork
agent: image-blast-world
---

Create or resume one World Labs world for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- Use an explicit image path or prompt from `$ARGUMENTS` when provided.
- Without an explicit image, the world helper uses the highest-index visible image in `worlds/$0/source/`.
- Before generating from an image, reveal the selected image in its folder for the user and ask them to confirm it looks good for world generation. If it is a plate, treat that plate as the source to preview. If the user asks for additional source edits or cleanup, stop and hand off to the relevant edit/plate skill; do not call World Labs until the user approves the image.
- The helper resumes unfinished `.N-world-request.json`, strips base64 before writing JSON, polls World Labs, writes `N-world.json`, and downloads every referenced world asset to matching `N-world*` files in `worlds/$0/output/world/`.
- The frontend must only load local files from disk. World Labs URLs in `world.json` are provenance/resume data only; never leave `.spz`, collider `.glb`, panorama, or thumbnail assets to be loaded from provider URLs.
- If any referenced `.spz`, collider, or panorama URL exists in `world.json`, make sure the matching local file is present before reporting success. Use the generic local asset tool on the matching `N-world.json` if files are missing.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Preview the exact source image that will be used:

```bash
node .claude/scripts/project/show-path.mjs --reveal "<selected source image path>"
```

Then ask: "Does this source look good for world generation, or should I make more edits first?" Wait for the user's confirmation before continuing.

Run:

```bash
node .claude/scripts/world/generate-world.mjs --world "$0"
```

Only pass `--image` or `--prompt` when explicitly provided. For explicit regeneration, append `--regenerate`.

To fill missing local files from an existing world response, run:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "worlds/$0/output/world/<N>-world.json"
```

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report the source image used when relevant, the generation index, world output path, all downloaded `.glb`, `.spz`, panorama, and thumbnail paths if present, and any failure/resume metadata.
