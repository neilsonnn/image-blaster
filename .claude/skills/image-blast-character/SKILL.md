---
name: image-blast-character
description: Generate one animated humanoid character (rigged + skinned + idle/walk animation) from a single image. Use when the user wants a moving enemy/NPC, not a static prop. Wraps Meshy v6 image-to-3D with rigging+animation flags; falls back to Hunyuan static when Meshy can't rig (non-humanoid, exotic anatomy).
argument-hint: [world-name] [character-id or image path] [--from-text "prompt"] [--rigged true|false] [--action-id N] [--target-polycount N] [--regenerate]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/asset-pipeline/meshy-3d.mjs *) Bash(node .claude/scripts/asset-pipeline/hunyuan-3d.mjs *) Bash(curl *)
context: fork
agent: image-blast-character
---

Generate one rigged + animated humanoid character for project `$0` from a single reference image.

## When to use this vs. image-blast-3d

- **image-blast-3d** — static props (furniture, decorations, weapons-as-pickups). Hunyuan-3D, no skin weights.
- **image-blast-character** — moving humanoid characters (enemies, NPCs). Meshy v6 with auto-rig + animation. The output GLB has a skeleton, skinned mesh, and one bundled animation clip.

If the user is unsure whether the target is "character" or "prop" — ask. Anything that needs to walk, attack, talk, idle, or otherwise animate is a character.

## Required pose for input image

The input image must be a **full-body humanoid in T-pose or A-pose, front view, on a clean plain background**. Meshy auto-rig fails or warps if:

- The character is cropped (head or feet cut off)
- Arms are at the sides, akimbo, or holding objects (Meshy can't see shoulder joints)
- The viewpoint is 3/4, side, or below the waist
- The background is busy (skin/clothing segmentation fails)
- The character is animal/quadruped/non-humanoid (Meshy is humanoid-only)

For non-humanoid creatures, fall back to `/image-blast-3d` and rig manually in Blender — note this to the user up-front.

## Workflow

1. Resolve the project slug via `$0`. If missing, ask which `worlds/<world-name>/` to use. Inspect with `ls -a`.

2. Resolve the source image:
   - If `$ARGUMENTS` contains an existing image path, use it.
   - Else if `--from-text "<prompt>"` is provided, synthesize a T-pose reference via FAL flux-schnell and save it to `worlds/$0/source/<char-slug>-tpose.png`. Required prompt scaffold:

     ```
     Full-body <character description>, standing in T-pose with arms stretched out horizontally to the sides, palms facing down, legs straight, feet shoulder-width apart, photographed from directly front, full body visible head to toe, plain pure white background, even neutral studio lighting, anatomically correct human proportions, video game 3D character base mesh reference, no shadow on ground, no extra props
     ```

   - Else fail: ask the user for either an image path or `--from-text "<prompt>"`.

3. Confirm with the user: show the chosen image, ask whether the pose/framing is acceptable. If not, regenerate (text path) or ask for a better image (path mode).

4. Ensure `worlds/$0/output/<char-slug>/` exists and write a minimal `object.json` so project state tools see this character. Use:

   ```json
   {
     "schema_version": 1,
     "world": "$0",
     "object": {
       "id": "<char-slug>",
       "name": "<character name>",
       "description": "<short literal description>",
       "kind": "character",
       "materials": [],
       "source_images": ["worlds/$0/source/<char-slug>-tpose.png"],
       "evidence": [],
       "generate_as_3d_object": true,
       "working_dir": "worlds/$0/output/<char-slug>"
     },
     "updated_at": "..."
   }
   ```

5. Run Meshy with rigging + animation (default = idle-stand, action-id 12). For walk use action-id 6, for run action-id 4 — confirm Meshy's action ID list in their FAL docs before claiming a specific one in the output:

   ```bash
   node .claude/scripts/asset-pipeline/meshy-3d.mjs \
     --image "worlds/$0/source/<char-slug>-tpose.png" \
     --output-dir "worlds/$0/output/<char-slug>" \
     --asset-name "<char-slug>" \
     --enable-rigging true \
     --enable-animation true \
     --rigging-height-meters 1.7 \
     --animation-action-id 12 \
     --target-polycount 30000 \
     --should-texture true \
     --enable-pbr true
   ```

6. After Meshy completes, inspect the response. If `enable_rigging` succeeded, the output will include a skinned mesh with an Armature node and bundled animation clip in the GLB/FBX. If rigging failed (Meshy returned an error or only static mesh), fall back:

   - Re-run with `--provider hunyuan` via `/image-blast-3d` to produce a clean static mesh
   - Tell the user the auto-rig failed and propose either (a) manual rig in Blender, (b) external auto-rig service (AccuRIG, Mixamo). Don't pretend the static mesh is animated.

7. Optionally convert the GLB to FBX for engines that need FBX (Unity supports both via glTFast, Unreal prefers FBX). The repo ships a Blender headless converter at:

   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background \
     --python <repo>/tools/glb_to_fbx.py -- <input.glb> <output.fbx>
   ```

   Note: this is in the parent project, not in image-blaster itself yet. If the user wants FBX, copy the script into their project or ask before adding it here.

8. Report:
   - Generated mesh path (GLB + OBJ if Meshy emitted both)
   - Whether rigging succeeded (true/false)
   - Animation clip name and length (if any)
   - Polygon count
   - Recommended import settings: Unity → Rig type = Humanoid for Meshy auto-rigs (Meshy uses Mixamo-compatible naming on its bones).

## Output locations

- Reference image: `worlds/$0/source/<char-slug>-tpose.png`
- Generated assets: `worlds/$0/output/<char-slug>/<char-slug>.glb` (and `.fbx`, `.obj` if returned)
- Character intent: `worlds/$0/output/<char-slug>/object.json`
- Per-request metadata: hidden `.<index>-<char-slug>__model-request.json` files alongside artifacts

## Cost & timing

- flux-schnell text-to-image: ~$0.003 per attempt, ~5s
- Meshy v6 image-to-3D with rigging+animation: ~$0.50–1.00 per character, ~3-5 minutes
- Hunyuan fallback: ~$0.30, ~1-2 minutes

Total for a successful auto-rigged character: ~$0.50–1.00 and 4-6 minutes wall clock.

## Future extensions

- Multiple animation clips per character (Meshy returns one; chain calls with different `--animation-action-id` and merge in Blender)
- Non-humanoid rigging via Tripo3D (different API, not currently in image-blaster)
- LoRA-style fine-tuned character generation pre-step for stylistic consistency
