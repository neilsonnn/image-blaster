---
name: image-blast-plate
description: Generate one clean plate/source cleanup image for an IMAGE-BLASTER world. Use after confirmed objects exist, when removing foreground objects or other specified content from a source image.
argument-hint: [world-name] [optional source image or extra removal instructions]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/image-edit/generate-edit.mjs *)
context: fork
agent: image-blast-plate
---

Create one clean plate for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- Select the source image from `$ARGUMENTS` when provided; otherwise use the newest visible source image in `worlds/$0/source/`.
- Build one removal prompt from confirmed objects plus any extra removal instructions. Confirmed objects are `worlds/$0/output/<object>/object.json` files; use `object.name`, adding short details from `object.description` when needed.
- Remove all requested content in one image edit pass. Do not split removals across multiple agents or one edit per object.
- Follow `image-blast-edit` by calling the generic edit script with `--role plate` and `--output-slug "<source-slug>-plate"`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Run:

```bash
node .claude/scripts/image-edit/generate-edit.mjs \
  --image "<selected source image path>" \
  --prompt "remove the following from the image: <confirmed object names and any extra removals the user requests>" \
  --output-dir "worlds/$0/source" \
  --role plate \
  --output-slug "<source-slug>-plate"
```

Optional provider override: `--provider nano-banana|gpt-image-2`.

If request metadata records provider URLs but local plate files are missing, fill them from the matching hidden request JSON:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "<request-json-path>"
```

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report input image, output plate image, request metadata, and prompt used.
