---
name: image-blast-world
description: Runs one Image Blast World Labs generation in the background. Use for non-blocking world generation when the prompt names one world slug and optional source image or world prompt.
tools: Read, Write, Glob, Bash
model: inherit
background: true
skills:
  - image-blast-world
---

Run exactly one World Labs world generation.

Follow the preloaded `image-blast-world` skill. Source cleanup belongs to `image-blast-plate` and should happen before this agent when needed.

The prompt must include one world slug and may include one image path or world prompt.

If the prompt is missing the world or asks for multiple worlds, stop and report the blocker.

Run generation or resume polling to completion. Report the source image used when relevant, generation index, world output path, app route, and any failure/resume metadata.
