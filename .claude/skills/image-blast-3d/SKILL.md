---
name: image-blast-3d
description: Generate one specified atomic 3D object. Use when the user names exactly one object instance to make, or provides one image plus the object name/description.
argument-hint: [world-name] [object-id/name or image path + object description] [--image-edit-prompt prompt] [--provider meshy|hunyuan|tripo] [--regenerate] [--regenerate-reference] [--target-polycount N] [--face-count N] [--generate-type Normal|LowPoly|Geometry] [--polygon-type triangle|quadrilateral] [--enable-pbr true|false]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/asset-pipeline/generate-single-asset.mjs *)
context: fork
agent: image-blast-3d
---

Create exactly one 3D object for project `$0`.

## Instructions

The arguments must identify one object clearly enough for this forked skill to work alone.

- If `$0` is missing, ask for the world slug.
- If the object is missing or ambiguous, ask for exactly one atomic object instance.
- Use `ls -a` before reading generated state.
- Find the object in `worlds/$0/output/<object>/object.json`, `worlds/$0/image.json`, or `worlds/$0/source/*.json`.
- If the object has no `object.json`, create the minimal durable intent:

```json
{
  "schema_version": 1,
  "world": "$0",
  "object": {
    "id": "<object-slug>",
    "name": "<object name>",
    "description": "<literal object description>",
    "materials": [],
    "source_images": [],
    "evidence": [],
    "generate_as_3d_object": true,
    "working_dir": "worlds/$0/output/<object-slug>"
  },
  "updated_at": "..."
}
```

- Preserve available `description`, `materials`, `source_images`, and `evidence`.
- Write a natural image-edit prompt for this specific object and pass it as `--image-edit-prompt`. Use this as the base prompt, filling in the target object and then elaborating with object-specific details: "Isolate the <target object> from this image. Reproduce it exactly as shown -- same colors, materials, and proportions. White background, centered, tight crop, studio lighting. No other objects, no scene, no people, no text, no shadows on the ground. Isolate the object and remove all clustered, adjacent, overlapping, or items resting on the target object. Create a clean render of that one single object that is true to the source image."
- The prompt must ask for one atomic physical instance only: not a pair, set, cluster, category example, or adjacent duplicate. If the source contains similar objects, identify the target by location and exclude the others.
- Do not write generated status, jobs, file lists, or request lifecycle into `object.json`.

Run the generator and wait for it to finish:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --object-id "<object-id>" --image-edit-prompt "<object-specific extraction prompt>"
```

The first run may create a clean reference PNG with image edit. Later runs reuse the latest reference PNG by default, including `--regenerate` model runs. Use `--regenerate-reference` only when the user asks for a new extraction from the source image. For iterative refinement, pass `--reference-only` to stop after the image-edit step.

If request metadata records provider URLs but local model or image files are missing, fill them from the matching hidden request JSON:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "<request-json-path>"
```

Hunyuan is the default 3D provider. Hunyuan defaults are `--face-count 50000`, `--enable-pbr true`, and `--generate-type Normal`. If the user asks for more detail, polygon reduction, or a white geometry-only model, pass the matching options:

- `--face-count <40000-1500000>`
- `--generate-type Normal|LowPoly|Geometry`
- `--polygon-type triangle|quadrilateral` for `LowPoly`
- `--enable-pbr true|false`

Pass `--provider meshy` only when the user asks for Meshy. Meshy defaults are:

```json
{
  "topology": "triangle",
  "target_polycount": 30000,
  "symmetry_mode": "auto",
  "should_remesh": true,
  "should_texture": true,
  "rigging_height_meters": 1.7,
  "animation_action_id": 12,
  "enable_safety_checker": true,
  "enable_animation": false,
  "enable_rigging": false,
  "enable_pbr": true
}
```

For Meshy-specific requests, pass the matching options:

- `--target-polycount <integer>`
- `--topology triangle`
- `--symmetry-mode auto`
- `--should-remesh true|false`
- `--should-texture true|false`
- `--enable-animation true|false`
- `--enable-rigging true|false`

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

For explicit model regeneration from the existing reference, append `--regenerate`. For a new source extraction and model, append `--regenerate-reference`. For direct single-image generation, use:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --image "<image-path>" --object-name "<object-name>" --description "<description>" --image-edit-prompt "<object-specific extraction prompt>"
```

Final response: report the object id, output directory, generated model files, and any failed/resumable request metadata.
