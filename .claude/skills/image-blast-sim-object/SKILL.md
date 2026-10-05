---
name: image-blast-sim-object
description: Make one generated object sim-ready for the robot - metric scale, convex collision hulls, mass/inertia from material priors, grasp affordances, and a MuJoCo drop test. Use after an object (or object cousin) has a generated 3D model.
argument-hint: [world-name] [object-id] [--force]
allowed-tools: Read Glob Bash(ls *) Bash(uv run --project sim blastsim *)
context: fork
agent: image-blast-sim-object
---

Run the sim physics pass for exactly one object in world `$0`.

## Instructions

- Require a world slug in `$0` and exactly one object id in `$1` (cousins are object ids like `mug--matte-blue`). Stop and report if either is missing.
- Check readiness first. The object needs a valid `object.sim` block (with `size_m` for rigid/static) and a generated `N-<object>.glb`:

```bash
uv run --project sim blastsim state --world "$0"
```

- Articulated and deformable objects are skipped by the pass (they use procedural templates); report that instead of improvising.
- Run the pass, then the drop test. Pass `--force` only when the arguments include it:

```bash
uv run --project sim blastsim object --world "$0" --object "$1"
uv run --project sim blastsim validate --world "$0" --object "$1"
```

- The pass is idempotent: an unchanged model and size estimate report `up_to_date`.
- If the drop test fails on tilt or drift, or the pass notes an aspect mismatch, the usual causes are a wrong `sim.size_m` or a bad generated base. Report which; do not edit physics JSON by hand.

Final response: object id, status, mass range (kg), size (m), hull count, grasps that fit the robot gripper, drop-test result, and any notes.
