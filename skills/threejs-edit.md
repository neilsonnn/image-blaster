# threejs-edit

Edit a world's Three.js scene by reading and writing `worlds/<world-name>/scene/project.json`.

## File Format

The file uses the Three.js editor's native App format — plain JSON that the mrdoob Three.js editor (https://github.com/mrdoob/three.js/tree/master/editor) can open and save directly. The React app loads the `scene` portion using `THREE.ObjectLoader`.

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
  "history": { "undos": [] },
  "backgroundType": "Default",
  "environmentType": "Default"
}
```

Objects in `scene.object.children` follow `THREE.ObjectLoader` format: each has a `uuid`, `type` (e.g. `"Mesh"`, `"DirectionalLight"`, `"Group"`), `geometry` (uuid reference), `material` (uuid reference), and optional `matrix` or `position`/`rotation`/`scale`.

## Instructions

1. Read the user's request to understand what objects to add or modify.
2. Read `worlds/<world-name>/scene/project.json` if it exists. If it does not exist, start from a minimal valid template (see format above).
3. Make the requested changes:
   - To **add** an object: append a geometry to `geometries`, a material to `materials`, and a mesh/light/group entry to `scene.object.children`. Generate a UUID for each new element.
   - To **modify** an object: find it by UUID or name in `scene.object.children` and update its properties.
   - To **remove** an object: remove it from `children` and remove its unreferenced geometries and materials.
4. Write the updated JSON back to `worlds/<world-name>/scene/project.json`.
5. Report what was changed.

## Notes

- All UUIDs must be unique strings. Use a standard UUID v4 format.
- Positions, rotations, and scales can be expressed as `position: [x, y, z]` arrays or as a 16-element `matrix` array.
- Colors are stored as integers (e.g. `16777215` = `0xffffff` = white).
- The file is shared with the Three.js editor — preserve all top-level keys even if you don't modify them, so the editor can still open the file.
