# Local ComfyUI 1K profile

Use Node 24 (verified with 24.21; native zlib CRC32 and `node:sqlite`), existing native APIs and a prepared, noninterlaced 8-bit RGB/RGBA 1024×1024 PNG. The local route bypasses cloud image editing and fal recovery. It never changes provider automatically.

The shipped `hunyuan_3d_comfy_api.json` is an unqualified legacy example. Pass `--workflow` with a real exported ComfyUI API workflow. The runner checks node classes, required inputs and available enum/model choices. One `LoadImage` node must receive the prepared PNG; completion must expose exactly one GLB file descriptor. Server must be loopback HTTP; redirects are rejected.

## Hardware/quality policy

- RTX 3060 Ti class: one image, one job, batch one, fixed seed; preserve other GPU processes.
- Input and final texture atlas limit: 1024×1024. Render evidence: 1024×1024. These are distinct from mesh-generation voxel/octree/latent resolution.
- Begin shape qualification at octree 256 and the model's documented sampling defaults; do not set octree 1024 just because the image is 1K. Qualify lower chunk sizes/offload against the actual selected node pack. Do not apply text-encoder FP8 switches to an unrelated 3D model.
- Before new submissions the runner requires an empty queue and at least 6 GiB reported free CUDA VRAM. This is a conservative admission threshold, not proof the selected model fits. Use low-VRAM/offload settings in the actual exported workflow; no backend flags are fabricated by the runner.
- Shape and texture are separate gates. Official Hunyuan3D-2 documentation reports 6 GB for shape and 16 GB for shape plus texture. A 1K image is not evidence that its paint stage fits 8 GB. Qualify stages sequentially, unload shape before paint; otherwise report geometry-only. Any CPU projection/bake fallback must explicitly label inferred/flat unseen surfaces.
- Final runtime target: about 50k triangles (hard ceiling 100k for this pilot), 1K textures and 10 MB preferred file budget. CPU Blender postprocessing may decimate/resample an immutable master. These delivery limits are checked after download; the runner's `downloaded-awaiting-review` is not delivery acceptance.

## Run

From the image-blaster root (PowerShell):

```powershell
node .claude/scripts/asset-pipeline/local-comfyui-3d.mjs --image C:/path/reference-1k.png --output-dir C:/path/case/generated --object-id reviewed-object --workflow C:/path/qualified-api-workflow.json --server http://127.0.0.1:8188 --index 0 --preflight
```

Remove `--preflight` only after workflow and hardware qualification. Use the identical command to resume. `--timeout-ms 900000` controls each polling window. A polling timeout retains the prompt ID; no automatic POST retry occurs. New intentional generations use a new `--index` only after resolving the prior job.

This release qualifies the standalone runner. Cloud/provider wrapper changes are outside its scope. Always pass the reviewed 1K PNG explicitly; this command does not generate or edit a reference image.

## Recovery and status

State is `<index>-<object>-comfy-state.json`, pinned to source bytes, workflow JSON, loopback server port and profile. Native SQLite transaction locks serialize the job and the worker; localhost/IPv4/IPv6 loopback aliases share the worker lock identity. ComfyUI's queue also blocks submission while other work is present. External tools can still race the queue; operationally reserve the worker for qualification.

- `submitting`: POST may have reached the server but no prompt ID was saved. Inspect queue/history using the saved client ID. Do not retry blindly or delete state to regenerate.
- `submitted`: rerun polls the saved prompt ID. Existing node/model availability is not required for recovery.
- `downloaded`: rerun verifies the local hash and bounded GLB structure without needing the server online.
- SQLite releases transaction locks automatically on process termination, including before submission. Persistent `.lock.sqlite` files are normal; never delete a lock database while a worker may use it. A busy native lock blocks another operator without terminating it.
- Changed source/workflow/server is rejected for the same attempt. Missing, HTML, malformed or inaccessible geometry cannot be persisted as a downloaded GLB.

Image integrity checks use PNG chunk CRC, zlib decode, scanline dimensions/filters and fixed RGB/RGBA format. The GLB guard checks container/buffer/accessor ranges, finite positions, triangle indices and embedded-image references. It is intentionally bounded; run Khronos glTF-Validator, inspect texture dimensions and reopen/render the exported GLB before acceptance. Geometry-only output must never be called a textured completion.

## Required delivery evidence

Keep source/master hashes; selected model/node revisions and checkpoint hashes; workflow/seed; job ID; measured peak VRAM, duration and retry history; output hashes and actual counts/dimensions; Khronos report; reopened front/side/back/three-quarter renders; visual review and source-scale assumptions. Produce PNG/WebP previews from the actual accepted exported asset. Static GLB does not imply a rig, metric accuracy or physical material recovery.

```powershell
node --test .claude/scripts/asset-pipeline/local-comfyui-3d.test.mjs
```

Tests use fixtures/mocked Comfy responses, plus a real child-process termination/recovery check. They prove bounded runner behavior, not GPU inference or model likeness. Do not start the lower-tier-agent pilot until a real image-to-mesh and its chosen texture route pass independently.

Recommended next step: first qualify the installed native Hunyuan3D/SaveGLB nodes with a compatible pinned checkpoint; use an isolated mini-model wrapper only if needed for memory fit. Validate the exported workflow and run espresso when the GPU has adequate free memory.


## Observed espresso test (2026-10-23)

The pinned native Hunyuan3D-2 checkpoint executed with a 1024 RGBA input on RTX 3060 Ti while the emulator remained running. A 128-grid / CPU-VAE smoke test completed in 227.59 s and produced a loadable GLB with zero Khronos errors/warnings, but visual review FAILED (broken handle, rippling and loose fragments); 125,694 triangles also exceeded the pilot ceiling. No local textured asset or lower-tier-agent qualification is established. The 256-grid CPU decode attempt was explicitly interrupted, not silently retried.

In the installed native decoder, `num_chunks` means query points per batch, not number of batches. Record this implementation detail before tuning. ComfyUI CUDA free and Windows NVML physical free differed substantially under WDDM; report both and do not describe a CUDA admission pass as 6 GiB of recovered physical VRAM. A validator pass is insufficient for acceptance: reject broken target features, fragments, silhouette distortion or excessive triangles; retain rejected masters and evidence. Do not promote this smoke workflow as the qualified default.


### 256-grid correction evidence (2026-10-23)

The repaired espresso case now has a 49,990-triangle, single-component closed runtime GLB with zero boundary/nonmanifold edges and zero Khronos errors/warnings, reopened/rendered at 1K. Continuous handle and fragment defects improved, but broad body faceting/source likeness remains PARTIAL; no texture or lower-tier pilot acceptance is established. Keep the 128-grid failure as historical evidence, not the latest geometry result.

For the pinned non-turbo base checkpoint, use the tested 50-step/CFG-5 configuration with a 256 grid and native GPU VAE. In this installed ComfyUI version `VAE.process_output` clamps `(signed_field+1)/2`; **signed zero corresponds to normalized voxel threshold 0.5**. Applying the upstream signed zero directly to the normalized native output is incorrect and produced an oversized rejected mesh. Inspect the actual adapter before transferring isovalues. The task-local marching-cubes bridge uses installed scikit-image; it has not been installed or promoted as a shared default. Initialize the isolated worker output directory before saving fields. Preserve source field/master; the selected candidate uses sigma-1.5-voxel field filtering, minor-component removal and QEM reduction. Five extractor checks pass, but synthetic topology checks do not establish likeness. Keep texturing/delegation gated on visual quality. Evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/espresso-256-correction/RESULT.md`.


### Exact-conditioning qualification outcome (2026-10-24)

The fixed-seed 20261023, 256-grid exact-reference-conditioning experiment completed in 74.29 s. Live FP16 encoder input matched the pinned reference bitwise on CUDA. The exported 49,990-triangle, one-component closed GLB reopened/rendered and had zero Khronos errors/warnings, but body banding persisted: **visual gate FAIL; do not promote this case or start the lower-tier pilot**. Texturing/delegation remain on hold. The negative case is not a completed textured 1K capability.

Bounded component checks found DINO CPU FP32 relative RMSE 4.18e-7, one conditional DiT CPU FP32 evaluation relative RMSE 1.13e-6, and identical VAE CPU FP32 logits at 1024 fixed spatial probes. These do not prove complete GPU FP16 trajectory parity or a unique root cause. A 512-point precision probe likewise is not a full surface-distance bound. Preserve all raw/latent evidence rather than hiding defects with texture or unbounded seed/smoothing searches.

The private EspressoReferenceEncode adapter is case-specific and rejects RGBA bytes that differ from its pinned source. It is diagnostic code, not a general installed image-to-GLB default. Low-VRAM routing can select CPU for encoders; record the actual device/dtype at the boundary instead of inferring CUDA from generic model-load messages. The tested exact case explicitly placed this encoder on CUDA. No shared default was changed. Full evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/espresso-exact-geometry/RESULT.md`.


### Pinned mini checkpoint outcome (2026-10-24)

The standard Hunyuan3D-2mini checkpoint at revision f90a0f7df7d5e6f71109cf333f6a95a0ae3194a6 was SHA-256 verified before one fixed-seed 256-grid test. Its required native representation is 512 latent tokens with scale 1.0188137142395404; a 1K source image does not determine latent count. Preserve model-specific adapter/config parity when changing checkpoints. DINO weights and live encoder input matched the exact base comparison; DiT, VAE and latent representation changed together.

The 49,990-triangle closed GLB passed structural validation, but visible body bands and handle distortion remain: visual FAIL, no default promotion. Texturing and lower-tier delegation remain on hold. Recommended next step: qualify a clearer, diffusely lit reference with visible silhouette and handle opening. Evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/espresso-mini-checkpoint/RESULT.md`.


### Clearer-reference base test and Windows residency (2026-10-24)

The qualified diffuse white-mug reference was tested with original pinned base weights, seed 20261023, 50 steps/CFG 5 and 256 grid. Live FP16 CUDA input matched its newly source-bound reference fixture bitwise. The raw 754,940-triangle mesh already has body bands/rim waviness. The 49,990-triangle runtime is closed and passes glTF validation, but the raw visual defect prevents promotion. Texturing/delegation remain on hold; a clearer input has not established geometry acceptance.

On this Windows/WDDM machine CUDA reported about 6.97 GiB available while NVML reported about 4.74 GiB physically free. Default model residency kept DINO and DiT loaded and the initial attempt was interrupted at step 3 with near-full physical VRAM. A reviewed same-settings retry using ComfyUI's existing `--disable-smart-memory` flag unloaded unused stage models and completed in 83.38 s. This is one completed geometry run plus one interrupted attempt, not a clean timing benchmark. Preserve unrelated applications; record both memory views and actual model residency. This task-local worker flag is evidence, not a shared runner-default change. Recommended next step: compare the pinned upstream denoising trajectory under matched inputs/noise before further source/seed trials. Evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/mug-base-256/RESULT.md`.


### Pinned upstream trajectory comparison (2026-10-25)

A controlled 50-step, seed-20261023 comparison used the same 1K mug conditioning and exact shared FP16-rounded noise values. Native vs pinned upstream final latent relative RMSE was 21.690%; matching native time grid/FP32 accumulation and CFG batch order still left 21.617%. Same-input GPU FP16 output differences peaked at 0.864% relative RMSE; the corresponding CPU FP32 two-branch probe was 6.213e-6 relative RMSE. This narrows investigation toward precision/device execution and amplified denoising drift, but does not isolate a broken operation or prove the cause of banding. It is not full upstream pipeline or geometry acceptance. The controlled rounded noise differs slightly from the previous GLB run's FP32 start.

No new geometry decode, texture job or agent pilot was performed. Recommended next step: decode the saved native/upstream final latents through the same VAE/grid/extractor and review their raw geometry; do not rerun seeds. Texturing/delegation remain on hold. Evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/mug-denoising-parity/RESULT.md`.


### Paired decode and postprocessed geometry acceptance (2026-10-25)

Saved native/upstream final latents were decoded by the same pinned VAE at 256-grid. Both raw meshes retained wall bands; occupied-field IoU was 96.943%. Raw inference remains visually unqualified. A bounded three-candidate, smooth-ceramic-only Blender wall-fairing loop produced an agent-accepted approximate white-mug prop: 49,990 triangles, one closed component, zero glTF issues, <0.666% one-sided vertex/raw distance relative to diagonal, -0.0086% volume change, and >98.57% matched silhouette IoU. Minor rim/handle asymmetry remains; this is explicit postprocessing, not measured source fidelity or general model acceptance. Canonical recipe reproduction was byte-identical.

For future agents use `D:/workspace/data/repo/ui-ai-generation/image-blaster/.claude/scripts/asset-pipeline/LOCAL_3D_QUALIFICATION.md`, `local-3d-qualification.py` (evidence DAG/attempt/visual-hash gates), and `local-3d-ceramic-fairing.py` (reviewed upright smooth ceramic vessels only). Eleven focused gate tests pass. Use existing native runner lock/resume handling; do not create another submission scheduler. No new skill was registered and no general fairing default was promoted. Texturing and lower-tier delegation remain on HOLD. Recommended next step: reuse the accepted geometry-only case and validate a new reference/material before generalizing. Evidence: `C:/Users/Admin/Documents/Codex/2026-10-23/o/outputs/mug-paired-decode/RESULT.md`.


### Retained reference and non-transferable acceptance (2026-10-25)

The canonical geometry-only reference is `D:/workspace/data/repo/ui-ai-generation/image-blaster/.claude/scripts/asset-pipeline/reference-cases/diffuse-white-mug-256/`. `local-3d-reference-cases.json` pins the accepted asset/source identities and exact schema-v2 evidence graph hash. The current gate requires object/class/source/case binding in both a binding receipt and the actual visual review; a registered asset cannot be relabelled as another object. Nineteen focused tests pass, including copied/relabelled case rejection, borrowed visual review, reference graph drift and duplicate-view checks.

Before qualifying another object, create a new planning graph from `local-3d-case-template.json`, leave every stage pending, and obtain that object's own evidence and visual review. Never transfer this mug's passing statuses or fairing suitability to other objects. The gate enforces acceptance, not arbitrary GPU submission interception. Use the retained v2 graph for current verification; old v1 reports/graphs remain preserved historical evidence and fail the stronger gate. The retained core includes asset/source/views; large raw/latent/checkpoint dependencies remain at their declared hash-bound external locations. Texturing/delegation remain HOLD. Recommended next step: retain this regression case and require an independent graph when a new object is specified.
