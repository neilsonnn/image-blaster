# Local 1K image-to-GLB: reusable agent handoff

This is an operating procedure, not a saved session or an inference workflow. Use the existing runner, pending case template and evaluator. Do not create another scheduler, infer acceptance from a downloaded GLB, or test a new object merely to assemble evidence.

## Dispatch brief: fill before handing over

- **Goal:** one named object/case, deliverable, and explicitly authorized stages.
- **State:** first unfinished stage; new inference or evidence-only completion; existing prompt ID, if any.
- **Limits:** writable case/worker directories, attempt budget, protected applications, and holds.
- **Sources:** absolute case graph, qualified source, pinned checkpoint, API workflow, receipts and reviewer paths.
- **Next step:** exact permitted command and evidence required before proceeding.

Record the requested agent model and verify the actual session model when the harness exposes it. A model listed in a cache may be rejected by the account. Preserve rejected dispatches; do not silently substitute a stronger model. Report backend revision and billing as unavailable when not exposed. Separate dispatch failures, admission blocks, self-repairs, parent guidance and implementation repairs.

## Before inference

1. Set explicit absolute `case_dir`, `worker_dir` and `manifest` paths. Create a new graph from `local-3d-case-template.json` before qualifying another object. Fill unique case/object/class identity; all stages start pending. Never copy passing statuses, binding receipts or visual acceptance from another case.
2. Review that object's complete silhouette, source provenance and 1024-square mask. Synthetic references are not photographic reconstruction truth. Bind the exact PNG bytes.
3. Check physical NVML free memory **before dispatching an agent or starting a worker**: `nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits`. Require at least 6144 MiB. Before submission additionally require CUDA-reported free >=6 GiB and an empty queue. An NVML failure does not prove a CUDA measurement was performed. Preserve emulator and unrelated workloads; recheck after authorized cleanup.
4. Verify the full pinned checkpoint SHA-256. Use the known model-specific latent representation and source-bound encoder fixture. Record actual encoder device/dtype/parity. Do not confuse 1K image size with latent token count.
5. Reuse the existing worker `models.yaml` structure; it has a named mapping containing `base_path` and `checkpoints`, not scalar entries at the document root. Use native low-VRAM/offloading flags as documented in `LOCAL_3D_QUALIFICATION.md`. Record owned PID/command line and port ownership.
6. Reuse `local-comfyui-3d.mjs` and its lock/state handling. Inspect existing state before submitting; resume a known prompt rather than creating another one. Do not unlink lock databases. A replay must retain fresh raw mesh, latent, field, parity receipt and runner history.
7. Inspect a postprocessor's output contract before creating directories: recipes that use `mkdir(exist_ok=False)` must create their own candidate directory. Never delete a nonempty candidate to make a retry work. Preserve setup errors and attempt counts.

## Evidence-only mode

Freeze hashes of source, raw mesh, reduced mesh and textured asset before editing receipts. Preserve the incomplete graph and old hash manifest under versioned names. No inference, worker launch, seed change, bake, mesh export or asset overwrite is permitted. Read-only CPU topology/validator inspection of saved assets is permitted; diagnostic renders must use new paths and be recorded as diagnostics, not inference.

The selected **geometry graph asset** is the reduced GLB. Texture is a separate asset with its own hash, UV/material/PNG validation and actual render review. UV seam vertex duplication can produce multiple storage components and boundary edges in a textured export. Inspect the reduced mesh for the geometry topology gate and bind texture-to-geometry triangle equivalence separately; never report a textured storage topology as welded without measuring it.

## Paths and hashes

Every `{path, sha256}` checked by the evaluator resolves relative to the **graph directory**, including view descriptors inside receipts. The directory containing a receipt is not its path base. Use absolute paths for external models/evidence. Do not prefix a case-relative path with `outputs/<case>/` again. Do not move external evidence or edit a frozen registered graph to repair a path.

Generate descriptors from saved bytes with the standard library. The following command only prints JSON; it does not alter artifacts, set statuses, refresh a stale accepted graph or grant acceptance. Replace the example paths first. Run it again after a deliberate receipt edit, then update only that receipt's descriptor and downstream manifests.

```powershell
$manifest = 'C:/absolute/case/qualification-graph.json'
$files = @('C:/absolute/case/source-1k.png', 'C:/absolute/case/evidence/topology.json')
@'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1]).resolve().parent
items = []
for name in sys.argv[2:]:
    file = Path(name).resolve(strict=True)
    try:
        path = file.relative_to(root).as_posix()
    except ValueError:
        path = str(file)
    with file.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    items.append({'path': path, 'sha256': digest})
print(json.dumps(items, indent=2))
'@ | python - $manifest @files
```

Never type, truncate or guess a digest. A placeholder is not a valid hash. Do not blanket-refresh accepted evidence after drift: stop and investigate it. Hashes attest to bytes, not the truth of an unmeasured receipt.

## Receipt map

| Stage | Actual evidence to bind before `pass` |
| --- | --- |
| reference | Own source pixels, mask/provenance review, exact source hash |
| weights | Full checkpoint file path and SHA-256, verification log; not just a log claiming the hash |
| latent | Own saved latent, submitted workflow/runner state, source-bound encoder parity |
| decode | Own saved field and actual decode log/settings |
| extract | Immutable raw GLB and extractor settings/field lineage |
| candidate | Selected reduced GLB, own postprocess metrics, recipe and raw input hash |
| topology | Read-only inspection of selected reduced asset: components, boundary/nonmanifold edges, selected asset hash |
| validator | Actual validator run **on the selected graph asset**, issue counts and selected asset hash |
| budget | Actual triangle count/file size and selected asset hash |
| preservation | Own movement/volume metrics and measured silhouettes, or a complete explicit equivalence derivation |
| render | At least two distinct own views; if textured derivative views are used, bind the derivative and geometry-equivalence receipt |
| visual | Actual authorized reviewer receipt, same case/object/class/source/selected-asset identity, registered view hashes, residual defects |
| geometry | All prerequisites pass, final reviewer evidence and explicit geometry-only scope |

`case_binding` repeats `case_id`, `object_id`, `object_class`, `source_sha256`, `asset_sha256` exactly. The visual receipt repeats the same identity. Topology/validator/budget/preservation receipts bind `asset_sha256` to the selected reduced asset. Rehashing a validator report for a different GLB does not make it applicable.

For texture acceptance separately bind the textured GLB, embedded <=1024 texture/UV/material checks, its Khronos report, geometry-equivalence proof and front/oblique/back review. Keep unseen surfaces and source-lighting limitations explicit. A geometry-only evaluator result does not establish texture or measured PBR acceptance.

## Preservation provenance

Prefer own measurements. If reusing numbers from a same-geometry replay, prove and hash-bind all of the following; a similar silhouette or matching triangle count is insufficient:

1. Both raw inputs, exact indexed position payloads, primitive modes, node transforms and scene graph equivalence.
2. Both selected candidates and their exact byte equality, or an independently verified equivalent geometry comparison.
3. Original measured silhouette receipt, camera/mask recipe and relevant source artifacts. Retain exact camera labels: `0`, `315`, `45` degrees are not front/oblique/**back**.
4. A new receipt declaring the result **derived**, naming the actual paired inputs, numeric values, comparison method and limits. Do not claim fresh measurements or copy a prior acceptance decision.

Register every relied-on proof and measurement descriptor in the preservation stage's evidence array. The evaluator checks declared hashes; it does not automatically execute nested proofs or discover undeclared dependencies. The reviewer must assess the derivation. Register raw/candidate files too, so a valid proof receipt cannot conceal drift of its inputs.

## Final gate and seal

1. Preserve original failures and make at most three deliberate assembly corrections. Do not rerun inference to fix a receipt.
2. Resolve every path from the graph directory, remove placeholders, and generate hashes from bytes. Check required prerequisite edges; mark only completed stages pass. Use existing reviewer authorization; never invent visual approval.
3. Run the existing evaluator with an absolute manifest path:

   ```powershell
   python 'D:/workspace/data/repo/ui-ai-generation/image-blaster/.claude/scripts/asset-pipeline/local-3d-qualification.py' --manifest 'C:/absolute/case/qualification-graph.json'
   ```

4. Independently audit provenance even after exit 0. The gate catches structure/hash drift; plausible but unsupported measurements can still be wrong. Retain the complete evaluator JSON, reviewed graph hash and per-stage evidence.
5. Verify frozen source/raw/reduced/textured hashes are unchanged in evidence-only mode. Refresh the final evidence manifest after the last receipt/report edit, exclude the manifest from its own hash list, and verify every listed file. Do not change graph-bound receipts after the final gate without revalidating.
6. Report actual model/session, GPU submission count, setup errors/self-repairs, parent guidance/corrections, reviewer identity, texture scope and limitations. Keep source/class authorization case-specific. Stop only owned idle workers after checking PID/command line and empty queue; disable a completed watcher to avoid duplicate work.

Definition of done: a current complete graph, selected-asset receipts, independent review, unchanged protected assets, sealed evidence and truthful scoped result. Do not leave every stage pending after completing an asset or count an earlier gate pass as evidence for an edited graph. State cost/rework as unmeasured unless independently measured.

## Successor task text

Copy this brief into the next authorized agent task and fill every bracket:

> Work only in [case directory] and [owned worker directory]. The object is [one object], case [unique ID], source [absolute path + hash], material class [reviewed class]. Mode is [new inference / evidence-only]. Read this handoff and `LOCAL_3D_QUALIFICATION.md`; use the existing pending template/runner/evaluator. Current stage is [stage]; existing prompt is [ID or none]. Authorized actions are [actions]; holds are [holds]; preserve [applications/workloads]. Agent model is [explicit model], verified through [runtime record or unavailable]. Respect [attempt limit] and preserve rejected artifacts. Assemble actual asset-specific receipts with graph-relative descriptors generated from bytes. Bind proof dependencies explicitly; use own actual visual review or authorized receipt [path]. Do not copy prior acceptance or claim unsupported provenance. Run the evaluator, independently audit it, verify frozen hashes, seal evidence, and report actual self-repairs/guidance/limits. No new object or inference is authorized outside this brief. End with the recommended next step.

The croissant replay qualified a guided same-case result after setup self-repairs and parent evidence corrections. It did not establish unattended success, new-object generalization or cost savings. Recommended next step: use this procedure for the next separately authorized case; create no inference job merely to validate this handoff.
