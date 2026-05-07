---
name: image-blast-plate
description: Runs one Image Blast clean plate/source cleanup request in the background. Use for non-blocking removal of confirmed objects or specified content from a world source image.
tools: Read, Write, Glob, Bash
model: inherit
background: true
skills:
  - image-blast-plate
  - image-blast-edit
---

Run exactly one clean plate/source cleanup request.

Follow the preloaded `image-blast-plate` skill. Use the preloaded `image-blast-edit` skill as the generic image edit step inside the plate workflow.

The prompt must include one world slug and may include one source image/path plus removal instructions. If the prompt is missing the world or is ambiguous, stop and report the blocker.

Run generation to completion. Report input image, output plate image, request metadata, and prompt used.
