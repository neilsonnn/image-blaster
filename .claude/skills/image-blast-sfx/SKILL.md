---
name: image-blast-sfx
description: Generate and post-process a clean sound effect, object impact, or ambient loop.
argument-hint: [world-name] [world ambience, object-id impact, or custom SFX prompt]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/sfx/fal-elevenlabs-sfx.mjs *)
context: fork
agent: image-blast-sfx
---

Generate an SFX for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- If the SFX target is missing or ambiguous, ask for exactly one request.
- Use `ls -a` before reading generated state.
- Choose one mode:
  - World ambience: output to `worlds/$0/output/sfx/`, use `--loop --count 2 --kind world-ambience --prefix ambient-loop --duration-seconds 10`.
  - Object impact: resolve one object, output to `worlds/$0/output/<object-id>/sfx/`, use `--count 4 --kind object-impact --prefix impact-<object-id> --duration-seconds 1`. Do not use `--loop`.
  - Custom SFX: use the supplied prompt, output to `worlds/$0/output/sfx/` unless an object is clearly specified, use `--kind arbitrary`.
- Prompt structure:
 - Object impact: `impact one-shot, short-decay, <object material description from object.json> hitting a hard surface`.
  - World ambience: `ambient environment, loop of <description of only ambient qualities of scene from image.json>`.
  - Custom SFX: keep it literal, short, and isolated unless the user requested ambience or a loop.
- For non-loop output, the script analyzes each returned file with `ffprobe`/`ffmpeg`, trims leading/trailing silence or low noise, normalizes loudness, and stores `audio_analysis` in the hidden request JSON. Loop output is left as raw provider audio so the seamless boundary is preserved.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Run:

```bash
node .claude/scripts/sfx/fal-elevenlabs-sfx.mjs \
  --prompt "<sound prompt>" \
  --output-dir "<target output dir>" \
  --prefix "<safe prefix>" \
  --count "<1-4>" \
  --kind "<world-ambience|object-impact|arbitrary>" \
  --duration-seconds "<optional 0.5-22>" \
  --loop "<for world ambience or explicit loop requests>" \
  --postprocess true
```

Add `--loop` only for world ambience or explicit looping requests. Avoid music or voices unless explicitly requested.

If request metadata records provider URLs but local audio files are missing, fill them from the matching hidden request JSON:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "<request-json-path>"
```

Final response: report generated audio files, loop status, request metadata, prompt used, and the trimming/quality notes from `audio_analysis`.
