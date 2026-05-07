---
name: image-blast-wildcard
description: Discover and run any FAL API model or operation the user requests. Use this as a generic FAL escape hatch when the user wants to generate something that does not fit a narrower Image Blast skill.
argument-hint: [FAL model/endpoint or natural request] [inputs, prompt, files, output location]
allowed-tools: Read Write Glob WebFetch WebSearch Bash(ls *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/fal/run-fal.mjs *)
---

Resolve one arbitrary FAL API operation from `$ARGUMENTS`, confirm it with the user, then run it only after confirmation.

## Instructions

- There are two modes:
  - Discovery mode: normal user requests. Do not run a paid FAL request, call `run-fal.mjs`, or launch the background `image-blast-wildcard` agent until the user confirms the exact endpoint.
  - Execution mode: prompts that start with `CONFIRMED_FAL_ENDPOINT: <endpoint>`. Do not ask for model confirmation again; validate inputs and run exactly one request.
- Discover candidate models with the FAL Platform Model Search API, not the Explore page:
  - `https://api.fal.ai/v1/models?q=<query>&status=active&limit=5`
  - `https://api.fal.ai/v1/models?category=<category>&status=active&limit=5`
  - `https://api.fal.ai/v1/models?endpoint_id=<endpoint>&expand=openapi-3.0`
- Use `https://fal.ai/docs/llms.txt` and the model API docs only as fallback context when the model search response is insufficient.
- Present the best candidate endpoint(s), category, description, and any relevant schema notes. Ask the user to confirm one exact model endpoint before execution, naming it directly, such as `confirm fal-ai/flux/dev`.
- After confirmation in discovery mode, fetch the confirmed endpoint with `expand=openapi-3.0`, build schema-shaped JSON from the user's literal inputs, resolve the output location from the user's request or surrounding project context, and launch `Agent(image-blast-wildcard)` with a prompt that starts with `CONFIRMED_FAL_ENDPOINT: <endpoint>`.
- Build the request JSON from the schema and the user's literal inputs. Use schema defaults for optional fields. Ask only if a required field cannot be inferred, a referenced local file is missing, or `FAL_KEY` is unavailable.
- Use `ls -a` before reading generated state. Do not use a dedicated wildcard directory by default; choose the output directory contextually from the user's request, the active Image Blast project/world, an input file's surrounding generated-output directory, or another clear local workflow context. If no output location can be inferred, ask before execution.
- For local file inputs, pass them with `--file <schema_key>=<path>` so the helper converts them to model input URLs. For nested keys use dot paths, such as `image_urls.0`.

The confirmed background agent should run:

```bash
node .claude/scripts/fal/run-fal.mjs \
  --endpoint "<fal endpoint, such as fal-ai/flux/dev>" \
  --input-json '<schema-shaped JSON input>' \
  --output-dir "<output directory>" \
  --output-slug "<short output slug>" \
  --user-prompt "<literal user request>"
```

Use `--mode run` only when the FAL API page requires a direct `fal.run` call instead of the queue API. The default queue mode persists request metadata before polling and downloads any returned file URLs.

If request metadata records provider URLs but local files are missing, fill them from the matching hidden request JSON:

```bash
node .claude/scripts/project/ensure-local-assets.mjs --from "<request-json-path>"
```

Final response before confirmation: ask for confirmation of the exact endpoint. Final response after execution: report the endpoint, input summary, output directory, downloaded output files, request metadata, and any raw result fields that were not downloadable.
