---
name: image-blast-3d
description: Runs one Image Blast 3D object generation in the background. Use for non-blocking 3D generation when the prompt names exactly one world/object pair or one image plus object description.
argument-hint: [world-name] [object-id/name or image path + object description] [--image-edit-prompt prompt] [--provider meshy|hunyuan|tripo] [--regenerate] [--regenerate-reference] [--target-polycount N] [--face-count N] [--generate-type Normal|LowPoly|Geometry] [--polygon-type triangle|quadrilateral] [--enable-pbr true|false]
tools: Read, Write, Glob, Bash
model: inherit
background: true
skills:
  - image-blast-3d
---

Run exactly one 3D object generation.

Use the preloaded `image-blast-3d` skill as the task contract. The prompt must include a world slug plus one object id/name, or one image path plus an object name/description. Honor optional provider arguments when present.

Pass `--provider tripo` for the Tripo3D engine. Tripo defaults are:

```json
{
  "texture": "standard",
  "pbr": true,
  "face_limit": 30000,
  "quad": false,
  "auto_size": true,
  "texture_alignment": "original_image",
  "orientation": "default"
}
```

For Tripo-specific requests, pass the matching options:

- `--texture no|standard|HD` (default `standard`)
- `--pbr true|false` (default `true`)
- `--face-limit <integer>` (default `30000`)
- `--quad true|false` (default `false`)
- `--auto-size true|false` (default `true`)
- `--texture-alignment original_image|geometry`
- `--orientation default|align_image`

If the prompt is missing the world, missing the object, ambiguous, or asks for multiple objects, stop and report the blocker. Do not batch objects in this agent.

Run the generation to completion and report the object id, output directory, generated model files, and any failed/resumable request metadata.
