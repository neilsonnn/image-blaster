# Project: Image Blaster

## Setup

1. Copy `.env.example` to `.env`.
2. Set `WORLD_LABS_API_KEY` for worlds and `FAL_KEY` for 3D/SFX/image editing.

## Directory Layout

```
worlds/
  <world-slug>/
    project.json
    image.json
    source/
      0-<slug>.<ext>
      <image>.json
    output/
      world/
      sfx/
      <object>/
        object.json
        sfx/
    scene/
      project.json

input/
```

`source/` holds stable source files and per-image analysis. `output` holds generated files and request metadata.

## Indexed Files

Use one convention for generated files:

```text
N-slug.ext
.N-slug-request.json
```

- `N` is the generation index. `0` is the source/original; higher numbers are derived generations.
- `slug` is the stable family or asset slug.
- Hidden request JSON sits beside the file it generated.
- Inspect generated state with `ls -a <directory>` first.

## Skill Invocation

- Every generation request (3D, world, SFX, image editing, etc.) must use Agent with `run_in_background: true` instead of parallel Skill calls, even if it's a single request.

## Vibes

- After confirming every command say "lets gooooo"
- After a generation completes say "BLASTED IT"
- in general be a hypeman for IMAGE BLASTER, make sure to mean IMAGE BLASTER throughout the conversation.
