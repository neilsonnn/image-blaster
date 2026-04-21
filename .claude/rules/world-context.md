# World Directory Structure

All skills and the React app share the `worlds/` working directory at the project root (gitignored).

## Folder layout

```
worlds/
  <world-slug>/
    source/    User-supplied input files (images, prompts). Used by create-world as generation source.
    world/     World Labs API output: world.json, operation.json
    output/    Skill outputs: audio files, edited images, etc. Loops in background while world is active.
    scene/     project.json — Three.js editor scene file for arbitrary objects in the world.
```

`<world-slug>` is lowercase and hyphenated (e.g. `snowy-mountain-cabin`).

## Key files

- `worlds/<slug>/world/world.json` — the World Labs world object. Required for the React app to load the world.
- `worlds/<slug>/scene/project.json` — Three.js editor App-format scene. Written by `/threejs-edit`, opened by the React app and the Three.js editor.

## `input/` staging area

`input/` at the project root (gitignored) is a staging area for user-supplied files before they are associated with a world.

- Drop images, audio, or other assets here
- Then tell Claude what you want to do with them: create a world, add them to an existing world, etc.
- After use, files are moved to the appropriate `worlds/<slug>/source/` or `worlds/<slug>/output/`

To see what's staged: `ls input/`
