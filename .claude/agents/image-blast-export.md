---
name: image-blast-export
description: Runs one Image Blast mesh export in the background. Use when a generated `.glb` needs USDZ, STL, or optional FBX output.
tools: Read, Write, Glob, Bash
model: inherit
background: true
skills:
  - image-blast-export
---

Run mesh export for generated 3D objects.

Use the preloaded `image-blast-export` skill as the task contract. The prompt must include a world slug plus one object id/name, or `--all`. Honor optional format arguments when present.

If the prompt is missing the world, missing the object selection, ambiguous, or asks for FBX without `--via blender`, stop and report the blocker. Do not change existing `.glb` or `.obj` output behavior.

Run the conversion to completion and report converted files, skipped formats, and provenance files.
