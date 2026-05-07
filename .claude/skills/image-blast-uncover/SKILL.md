---
name: image-blast-uncover
description: Main image analysis skill, object generation, plate decisionmaking, and initial scene description. Use this skill when user wants to create objects and necessary for main image analysis.  
argument-hint: [world-name] [optional image paths or instructions]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/show-folder.mjs *)
---

Uncover literal image information for project `$0`. Additional image paths or instructions may appear in `$ARGUMENTS`.

## Instructions

Follow the generic file convention in `.claude/rules/project.md`. Use `ls -a` to inspect project/source/output directories before reading JSON details.

1. Require a project/world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to use.
2. Ensure the project envelope exists, stage any input images when appropriate, and read derived state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0" --stage-input
```

If no source images exist after staging and the user needs to add images, open the staging folder before asking them to drop files there:

```bash
node .claude/scripts/project/show-folder.mjs input
```

3. Read `IMAGE-BLAST.md` in this skill directory and follow its JSON contract exactly.
4. Gather source images from explicit paths in `$ARGUMENTS` and `worlds/$0/source/`. Use `input/` only through the project-state staging step so source paths are stable. Source images use indexed families (`0-<slug>.<ext>`, `1-<slug>.png`, etc.); by default, analyze the latest image in each family and do not treat every historical plate/edit as separate evidence unless requested.
5. Analyze one source image at a time:
   - Read the image directly using agent image understanding.
   - Use literal, observational language only.
   - Extract object candidates as single cleanly segmentable items only. Never group different items or create compound assets like furniture or tables with objects on top.
   - Write a sibling JSON file at `worlds/$0/source/<image-name>.json`.
   - Per-image JSON must use the same flat schema as root `image.json`.
   - Per-image JSON must not contain `images[]`.
6. Treat existing `worlds/$0/source/<image-name>.json` files as reusable analysis:
   - If the source image or user instruction changed, update the sibling JSON.
   - If the user deleted a source image or source JSON, do not recreate it unless the image still exists and should be analyzed.
7. After all per-image JSON files exist, derive `worlds/$0/image.json` by reading and merging all valid `worlds/$0/source/*.json` image analyses.
   - combine `source_images`
   - synthesize one shared `scene_name`, `short_caption`, and `literal_description`
   - merge `environment`, `visual_style`, `lighting`, `atmosphere`, and `ambient_sound`
   - deduplicate `objects` while preserving source-image evidence
   - use the same flat schema as each per-image JSON
   - do not write `images[]`
8. Present the root image analysis and merged object candidates to the user for approval or revision. Keep it concise:
   - scene name and short caption
   - literal environment, visual style, lighting, atmosphere, and ambient sound
   - object candidates with material and source-image evidence
9. Stop here until the user confirms which objects to create. When approved, create or update one object file per approved object:

```text
worlds/$0/output/<object-slug>/object.json
```

10. Each `object.json` should use this shape:

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

Object files store durable identity, intent, and provenance only. Do not write generated state such as `status`, `jobs`, generated `files`, request lifecycle, or completion data into `object.json`. Generated outputs and request state live beside `object.json` as indexed visible artifacts and hidden request JSON.

11. After object files are written, handle the clean plate decision:
   - In one-shot mode, continue with `Agent(image-blast-plate)` and wait for it before world generation.
   - Otherwise ask whether to remove confirmed objects any anything else the user wants to remove from the source image to create a clean plate to generate a world from.

12. Refresh derived project state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

13. Report saved paths, source image count, per-image JSON count, created/updated object directory count, and the clean plate decision.

## Output Locations

- Per-image analysis: `worlds/$0/source/<image-name>.json`
- Merged image and scene analysis: `worlds/$0/image.json`
- Object intent/provenance: `worlds/$0/output/<object-slug>/object.json`
- Clean plate decision: `worlds/$0/source/<source-slug>-plate.png`
