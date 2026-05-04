```text
          .-""""-.
        .'  o  o '.
       /     ^     \
      |   .------. |
      |  /|      |\ |
      |   | .jpg |  |   nom
      |   |      |  |
       \  '------' /
        '.       .'
          '-....-'
```
## `image-blaster`
A Claude Code project that creates a 3D environment, SFX, and meshes from a single image.

## Quickstart

1. Open a Terminal, enter `git clone` $\color{#1E90FF}{\texttt{https://github.com/neilsonnn/image-blaster}}$
2. Enter the directory with `cd` $\color{#9B5DE5}{\texttt{image-blaster/}}$
3. Run `claude` (install with `curl -fsSL` $\color{#1E90FF}{\texttt{https://claude.ai/install.sh}}$ `| bash`)
4. Say hello to Claude, and give them your API key for World Labs ($\color{#1E90FF}{\texttt{https://platform.worldlabs.ai/}}$) and FAL ($\color{#1E90FF}{\texttt{https://fal.ai/}}$).
5. Put an image into $\color{#9B5DE5}{\texttt{input/}}$ and ask Claude to `IMAGE-BLAST` it.

## Description

By default `image-blaster` will use your input image to create:

1. 3D models ($\color{#FFA500}{\texttt{.glb}}$, $\color{#FFA500}{\texttt{.obj}}$) of all *dynamic* objects
2. Gaussian splat ($\color{#FFA500}{\texttt{.spz}}$) of the *static* environment
3. Ambient looping sound and object specific physics SFX ($\color{#FFA500}{\texttt{.mp3}}$)

## Extensions

You can embed `image-blaster` under the assets of ***any game engine, DCC software, or web app***.

1. Unity, Unreal, or Godot game engine
2. Blender, 3DS Max, or Maya or other DCC software
3. Three.js web app or Electron app

- Video game level concepts? `IMAGE-BLAST` it.
- Your childhood bedroom? `IMAGE-BLAST` it.
- Need an environment for a robot? `IMAGE-BLAST` it.
- A film location scout? `IMAGE-BLAST` it.
- An architectural rendering? `IMAGE-BLAST` it.

## Advanced

IMAGE-BLASTER uses a few generation models:

- `marble-1.1` - World Labs Marble model creates the explorable environment.
- `nano-banana` - default image edit preference for source cleanup, clean plates, and object reference images.
- `gpt-image-2` - alternate image edit provider when the edit skill is asked to prefer it.
- `hunyuan-3d` - Hunyuan 3D model creates 3D object models through FAL.
- `elevenlabs-sfx` - ElevenLabs sound effects model creates ambient and object-specific sounds.

3D model creation supports these Hunyuan parameters:

- `--face-count <40000-1500000>`: target face count. IMAGE-BLASTER defaults to `50000`; Hunyuan's API default is `500000`.
- `--enable-pbr true|false`: enable PBR material generation. Defaults to `true`.
- `--generate-type Normal|LowPoly|Geometry`: `Normal` creates a textured model, `LowPoly` applies polygon reduction, and `Geometry` creates a white geometry-only model. Defaults to `Normal`.
