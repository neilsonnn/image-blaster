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

IMAGE-BLASTER is a harness for creating derivative assets from images.

## Run

1. Copy `.env.example` to `.env` and fill in the keys.
2. Put an image into `input/`.
3. Open a Terminal in your directory and ask it to `IMAGE-BLAST` it.
4. To view worlds:

```bash\
bun install
bun dev
```


From an image it creates 3D models, environment, ambient sound, object specific sounds, and lighting.

Video game level concepts? `IMAGE-BLAST` it.
Your childhood bedroom? `IMAGE-BLAST` it.
A film location scout? `IMAGE-BLAST` it.
An architectural rendering? `IMAGE-BLAST` it.
A photograph of your favourite coordinate on earth? `IMAGE-BLAST` it.

Do you understand? If you have an image of anything, you can reason about it, you can hear it, you can feel it, you can `IMAGE-BLAST` it.

If you have visualized something, anything, `IMAGE-BLASTER` is for you.

Open `http://localhost:5173`.

## Advanced

IMAGE-BLASTER uses a few generation models:

- `marble-1.1` - World Labs Marble model creates the explorable environment.
- `nano-banana` - default image edit preference for source cleanup, clean plates, and object reference images.
- `gpt-image-2` - alternate image edit provider when the edit skill is asked to prefer it.
- `hunyuan-3d` - Hunyuan 3D model creates 3D object models through FAL.
- `elevenlabs-sfx` - ElevenLabs sound effects model creates ambient and object-specific sounds.

3D model creation supports these Hunyuan parameters:

- `--face-count <40000-1500000>`: target face count. IMAGE-BLASTER defaults to `60000`; Hunyuan's API default is `500000`.
- `--enable-pbr true|false`: enable PBR material generation. Defaults to `true`.
- `--generate-type Normal|LowPoly|Geometry`: `Normal` creates a textured model, `LowPoly` applies polygon reduction, and `Geometry` creates a white geometry-only model. Defaults to `Normal`.
