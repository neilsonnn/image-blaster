---
name: image-blast-world
description: Generate the 3D static environment of a world.
argument-hint: [world-name] [optional image path or world prompt]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/world/generate-world.mjs *)
context: fork
agent: image-blast-world
---

Create or resume one World Labs world for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- Use an explicit image path or prompt from `$ARGUMENTS` when provided.
- The helper resumes unfinished `operation.json`, strips base64 before writing JSON, polls World Labs, and writes `world.json`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Run:

```bash
node .claude/scripts/world/generate-world.mjs --world "$0" --image "<optional image path or URL>" --prompt "<optional world prompt>"
```

Omit `--image` or `--prompt` when not provided. For explicit regeneration, append `--regenerate`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report the world output path and any failure/resume metadata.
