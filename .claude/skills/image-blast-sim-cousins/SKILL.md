---
name: image-blast-sim-cousins
description: Create object cousins for robot sim robustness - appearance cousins (same object, different look) and functional cousins (different object, same use). Use when the user wants variants, cousins, or domain randomization of a blasted object.
argument-hint: [world-name] [object-id or "all"] [count per kind]
allowed-tools: Read Glob Bash(ls *) Bash(uv run --project sim blastsim *)
---

Create object cousins for world `$0`.

## Instructions

- Read the parent's `worlds/$0/output/<object>/object.json` and its latest reference image path. Only base objects get cousins (never a cousin of a cousin).
- Propose cousins before generating, unless the user asked for one-shot:
  - appearance: same shape class and function, different material finish, color, wear, or label. Keep `size_m` and `material_class` unless the finish changes the material.
  - functional: a different object a robot would use the same way (mug -> tumbler, beaker, cup). Set `--material`, `--mass-kind`, and `--size` for it, keeping the grasp width within the robot gripper (`uv run --project sim blastsim robot check` shows the spec).
  - Write each image-edit prompt as an isolated product shot of one object on a plain background.
- For each approved cousin, write the envelope:

```bash
uv run --project sim blastsim cousin --world "$0" --object <parent> --slug <slug> --kind appearance|functional --prompt "<image-edit prompt>" [--material <class>] [--mass-kind solid|shell|container] [--size W D H]
```

- Then launch one background `Agent(image-blast-3d)` per cousin with the world, the printed object id, and `--image-edit-prompt` set to the cousin prompt.
- After each 3D model lands, launch one background `Agent(image-blast-sim-object)` for that cousin.

Report the cousins created (id, kind, prompt) and which agents were launched.
