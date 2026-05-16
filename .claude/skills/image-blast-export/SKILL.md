---
name: image-blast-export
description: Convert generated 3D objects to additional formats (USDZ, STL, optional FBX). Use when an image-blaster object has a `.glb` and the user needs a different format for a game engine, AR target, or 3D printer.
argument-hint: [world-name] [object-id or --all] [--formats usdz,stl,fbx] [--via blender]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/asset-pipeline/convert-mesh.mjs *)
context: fork
agent: image-blast-export
---

convert generated 3D objects for project `$0`.

## when to use it

use this after `image-blast-3d` has produced a `.glb` model in `worlds/$0/output/<object-id>/`.

## defaults

- USDZ and STL are exported with pure node/three-stdlib.
- FBX is skipped unless the user passes `--via blender`.
- If FBX is requested and `blender` is not on PATH, skip it and report the warning.

## invocation

run one conversion per `.glb`:

```bash
node .claude/scripts/asset-pipeline/convert-mesh.mjs --input "worlds/$0/output/<object-id>/<N>-<object-id>.glb" --output-dir "worlds/$0/output/<object-id>" --asset-name "<object-id>" --formats usdz,stl
```

when the user requests FBX, include both `fbx` and `--via blender`:

```bash
node .claude/scripts/asset-pipeline/convert-mesh.mjs --input "worlds/$0/output/<object-id>/<N>-<object-id>.glb" --output-dir "worlds/$0/output/<object-id>" --asset-name "<object-id>" --formats usdz,stl,fbx --via blender
```

## filenames

preserve the asset index and slug in generated filenames: `N-<object>.usdz`, `N-<object>.stl`, and `.N-<object>-<format>-request.json`.

final response: report converted files, skipped formats, and provenance files.
