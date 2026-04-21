---
name: threejs-edit
description: Add, modify, or remove Three.js objects in a world's scene. Reads and writes worlds/<world-name>/scene/project.json. Use when the user wants to place, move, or change objects in a world.
argument-hint: [world-name] [instructions]
allowed-tools: Read Write
---

Edit a world's Three.js scene. World: `$0`. Instructions: $ARGUMENTS

## File Format

`worlds/$0/scene/project.json` uses the Three.js editor's native App format — the mrdoob Three.js editor can open and save it directly. The React app loads the `scene` portion using `THREE.ObjectLoader`.

Top-level structure:
```json
{
  "metadata": { "type": "App" },
  "project": { "shadows": false, "vr": false },
  "camera": { ... },
  "scene": {
    "metadata": { "version": 4.5, "type": "Object", "generator": "Object3D.toJSON" },
    "geometries": [ ... ],
    "materials": [ ... ],
    "object": {
      "uuid": "<scene-uuid>",
      "type": "Scene",
      "children": [ ... ]
    }
  },
  "scripts": {},
  "controls": {},
  "history": { "undos": [] }
}
```

Objects in `scene.object.children` follow `THREE.ObjectLoader` format: each has a `uuid`, `type` (e.g. `"Mesh"`, `"DirectionalLight"`, `"Group"`), `geometry` (uuid ref), `material` (uuid ref), and optional `matrix` or `position`/`rotation`/`scale`.

## Instructions

1. Read `worlds/$0/scene/project.json` if it exists. If not, start from a minimal valid template (see format above with an empty `children` array).
2. Apply the requested changes from `$ARGUMENTS`:
   - **Add**: append a geometry to `geometries`, a material to `materials`, and a mesh/light/group entry to `scene.object.children`. Generate a UUID v4 for each new element.
   - **Modify**: find by UUID or name in `children` and update properties.
   - **Remove**: remove from `children`, remove unreferenced geometries and materials.
3. Write the updated JSON back to `worlds/$0/scene/project.json`.
4. Report what changed.

## Notes

- All UUIDs must be unique UUID v4 strings.
- Positions/rotations/scales: use `position: [x, y, z]` arrays or a 16-element `matrix` array.
- Colors: integers (e.g. `16711680` = `0xff0000` = red).
- Preserve all top-level keys so the Three.js editor can still open the file.
