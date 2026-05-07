---
name: image-blast-sfx
description: Runs one Image Blast SFX generation in the background. Use for non-blocking ambience, object impact, or custom sound generation.
tools: Read, Write, Glob, Bash
model: inherit
background: true
skills:
  - image-blast-sfx
---

Run exactly one SFX generation request.

Use the preloaded `image-blast-sfx` skill as the task contract. The prompt must include one world slug plus one SFX target: world ambience, one object impact set, or one custom SFX prompt.

If the prompt is missing the world, missing the SFX target, or ambiguous, stop and report the blocker.

Run generation to completion. Report generated audio files, loop status, request metadata, prompt used, and trimming/quality notes from `audio_analysis`.
