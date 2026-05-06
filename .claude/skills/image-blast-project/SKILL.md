---
name: image-blast-project
description: Create, inspect, and manage an IMAGE-BLAST project envelope under worlds/<slug>. Use before other image-blast skills (image-blast-uncover, image-blast-world, image-blast-3d, etc.) or whenever the user asks about active project state.
argument-hint: [world-name or description] [optional instructions]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/indexed-path.mjs *) Bash(node .claude/scripts/project/download.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/project/delete.mjs *) Bash(node .claude/scripts/project/show-folder.mjs *)
---

Create or inspect an Image Blast project. Input: `$ARGUMENTS`.

## Instructions

Follow the generic file convention in `.claude/rules/project.md`. Inspect generated directories with `ls -a` before reading JSON details.

Use generic project tools for local indexed asset path computation, explicit downloads, local asset repair, and deletion. Provider-specific scripts are only for provider generation/polling.

1. Resolve the project slug:
   - If `$0` is an existing `worlds/<slug>` directory or a slug-like name, use it.
   - Otherwise derive a lowercase hyphenated slug from `$ARGUMENTS`.
   - If no usable input is provided, ask the user which project/world to use.
2. Run the project-state helper from the repo root. If `input/` contains images or the user asked to use staged input, include `--stage-input` so files move immediately into stable source paths:

```bash
node .claude/scripts/project/project-state.mjs --world "<slug>" --stage-input
```

Open the project folder for the user after creating or resolving it:

```bash
node .claude/scripts/project/show-folder.mjs "worlds/<slug>"
```

3. The helper creates and validates:

```text
worlds/<slug>/
  project.json
  image.json
  source/
    <image-name>.json
  output/
    world/
    sfx/
    <object-slug>/
  scene/
```

Only minimal `project.json` and directories are created automatically. `/image-blast-uncover` writes per-image `source/<image-name>.json` and root `image.json`, then waits for user confirmation before writing per-object `output/<object-slug>/object.json` files.

4. Read the printed project state or `worlds/<slug>/project.json`.
5. Report:
   - project slug and display name
   - source file count
   - per-image JSON count
   - staged files moved from `input/`, if any
   - whether World Labs output exists
   - whether `image.json` exists
   - derived object count
   - whether world-level SFX exists
   - whether `scene/project.json` exists
6. If source images now exist and `image.json` is missing, continue directly with the `/image-blast-uncover` workflow for no-cost image analysis and object directory creation.
   If no source images exist and the user needs to add images, open the staging folder before asking them to drop files there:

```bash
node .claude/scripts/project/show-folder.mjs input
```

7. Recommend downstream actions only after no-cost setup/analysis is complete, in this order:
   - `Agent(image-blast-plate)` for clean plate/source cleanup after object confirmation, when requested or one-shotting
   - `Agent(image-blast-world)` for static 3D environment world generation
   - `Agent(image-blast-3d)` per object 3D generation
   - `Agent(image-blast-sfx)` for ambient, object-impact, or arbitrary sound effects
   - `Agent(image-blast-edit)` for generic standalone prompt-based image editing
