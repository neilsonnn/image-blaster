---
name: image-blast-edit
description: Generate one image edit from explicit input images and a prompt. Use for source cleanup, clean plates, object removal, or other FAL-backed image edits.
argument-hint: [image path] [prompt] [optional output dir, role, output slug]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/image-edit/generate-edit.mjs *)
context: fork
agent: image-blast-edit
---

Create one edited image.

## Instructions

- Require at least one input image and one edit prompt.
- Use `ls -a` before reading generated state.
- Use the output directory, role, and output slug provided by the caller.
- Use `--role` for semantics such as `plate`, `object-mask`, or `image-edit`.
- Use `--output-slug` for the visible indexed artifact name, such as `<source-slug>-plate`.

Run:

```bash
node .claude/scripts/image-edit/generate-edit.mjs \
  --image "<input image path>" \
  --prompt "<edit prompt>" \
  --output-dir "<output directory>" \
  --role "<role>" \
  --output-slug "<output slug>"
```

Optional provider override: `--provider nano-banana|gpt-image-2`.

If request metadata records provider URLs but local image files are missing, fill them from the matching hidden request JSON:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "<request-json-path>"
```

Final response: report input images, output image, request metadata, role, and prompt used.
