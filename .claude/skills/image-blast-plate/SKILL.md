---
name: image-blast-plate
description: Generate an image edit that removes generated objects or specified content from source images.
argument-hint: [world-name] [optional source image or extra removal instructions]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/plate/generate-plates.mjs *)
context: fork
agent: image-blast-plate
---

Create images plates for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- By default, remove confirmed objects, a confirmed object is any `worlds/$0/output/<object>/object.json` file that exists.
- If `$ARGUMENTS` names a source image/path, process only that source family unless the request says all.
- Pass extra removal instructions through `--remove`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Run:

```bash
node .claude/scripts/plate/generate-plates.mjs \
  --world "$0" \
  --remove "<optional extra removal instruction>" \
  --image "<optional source image path or name>"
```

Omit `--image` when processing all source families. Optional provider override: `--image-edit-provider nano-banana|gpt-image-2`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report input images, output plate images, request metadata, and prompts used.
