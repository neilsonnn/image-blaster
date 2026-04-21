---
name: create-world
description: Create a new World Labs world from a text prompt or image. Use when the user wants to generate a new 3D world, or when source images or assets are present in input/.
argument-hint: [description of the world]
allowed-tools: Bash(curl *) Bash(mkdir -p *) Bash(base64 *) Bash(sleep *) Write Read
context: fork
agent: general-purpose
---

Create a World Labs world. The world description is: $ARGUMENTS

## Instructions

### 1. Determine slug

Derive a lowercase hyphenated slug from `$ARGUMENTS` (e.g. "snowy mountain cabin" → `snowy-mountain-cabin`). If `$ARGUMENTS` is empty, ask the user for a description first.

### 2. Set up directory structure

```bash
mkdir -p worlds/<slug>/source worlds/<slug>/world worlds/<slug>/output worlds/<slug>/scene
```

### 3. Identify source image

Check `input/` first for any image file (`.jpg`, `.jpeg`, `.png`, `.webp`). If found, use image prompt mode and move the file to `worlds/<slug>/source/` after the world is created.

If nothing in `input/`, check `worlds/<slug>/source/` for an existing image.

If no image found anywhere, use text prompt mode.

### 4. Create the world

**Endpoint:** `POST https://api.worldlabs.ai/marble/v1/worlds:generate`

**Auth header:** `WLT-Api-Key: $WORLD_LABS_API_KEY`

**Text prompt body:**
```json
{
  "display_name": "<slug>",
  "world_prompt": {
    "type": "text",
    "text_prompt": "<world description from $ARGUMENTS>"
  }
}
```

**Image prompt body** (base64-encode the image file):
```json
{
  "display_name": "<slug>",
  "world_prompt": {
    "type": "image",
    "image_prompt": {
      "data_base64": "<base64-encoded image>"
    },
    "text_prompt": "<optional: description from $ARGUMENTS>"
  }
}
```

Save the full response to `worlds/<slug>/world/operation.json`. The response contains an `operation_id` field.

### 5. Poll until complete

**Endpoint:** `GET https://api.worldlabs.ai/marble/v1/operations/<operation_id>`

**Auth header:** `WLT-Api-Key: $WORLD_LABS_API_KEY`

Poll every **15 seconds**. Generation typically takes ~5 minutes.

- `done: false` → still generating, continue
- `done: true` + `response` populated → success
- `done: true` + `error` populated → failed, report error and stop

Update `worlds/<slug>/world/operation.json` each poll.

### 6. Write world.json

When complete, write `response` from the operation to `worlds/<slug>/world/world.json`.

### 7. Move staged files

If a source image came from `input/`, move it: `mv input/<filename> worlds/<slug>/source/`

### 8. Report result

Tell the user:
- Slug and display name
- Caption (AI-generated description)
- Thumbnail URL
- World is available in the app at `/<slug>`
