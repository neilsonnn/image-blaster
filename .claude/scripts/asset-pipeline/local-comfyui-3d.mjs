import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { inflateSync, crc32 } from 'node:zlib';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function writeState(file, value) {
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2));
  await fs.rename(file + '.tmp', file);
}

async function acquireLock(file) {
  // Native SQLite/OS locks are released on process death, including acquisition.
  // Never unlink lock databases: removal would create two independent locks.
  const db = new DatabaseSync(file);
  try { db.exec('BEGIN IMMEDIATE'); }
  catch (error) { db.close(); throw new Error(`Job locked: ${file} (${error.message})`); }
  return async () => { try { db.exec('ROLLBACK'); } finally { db.close(); } };
}

export function inspectPng(input) {
  if (input.length < 45 || input.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
  let offset = 8, header, ended = false;
  const data = [];
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset), end = offset + 8 + length;
    if (end + 4 > input.length || crc32(input.subarray(offset + 4, end)) !== input.readUInt32BE(end)) throw new Error('Invalid PNG chunk/CRC');
    const type = input.toString('ascii', offset + 4, offset + 8);
    if (!header && type !== 'IHDR') throw new Error('PNG missing IHDR');
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error('Invalid PNG IHDR');
      header = input.subarray(offset + 8, end);
    }
    if (type === 'IDAT') data.push(input.subarray(offset + 8, end));
    offset = end + 4;
    if (type === 'IEND') { ended = length === 0 && offset === input.length; break; }
  }
  if (!ended || !header || header.readUInt32BE(0) !== 1024 || header.readUInt32BE(4) !== 1024 ||
      header[8] !== 8 || ![2, 6].includes(header[9]) || header[10] || header[11] || header[12]) throw new Error('Local 1K profile requires a noninterlaced 8-bit RGB/RGBA 1024x1024 PNG');
  const stride = 1 + 1024 * (header[9] === 2 ? 3 : 4);
  const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: stride * 1024 });
  if (pixels.length !== stride * 1024) throw new Error('Invalid PNG decoded length');
  for (let row = 0; row < 1024; row++) if (pixels[row * stride] > 4) throw new Error('Invalid PNG scanline filter');
}

// Bounded format/resource guard; full Khronos validation and visual review remain separate.
export function inspectGlb(bytes) {
  if (bytes.length < 28 || bytes.toString('ascii', 0, 4) !== 'glTF' ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length ||
      bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB v2 header/length');
  const end = 20 + bytes.readUInt32LE(12);
  if (end + 8 > bytes.length || bytes.readUInt32LE(end + 4) !== 0x004e4942 ||
      end + 8 + bytes.readUInt32LE(end) !== bytes.length) throw new Error('Invalid GLB binary chunk');
  const doc = JSON.parse(bytes.toString('utf8', 20, end));
  if (doc.asset?.version !== '2.0' || doc.buffers?.length !== 1 || doc.buffers[0].uri ||
      !doc.buffers[0].byteLength || doc.buffers[0].byteLength > bytes.length - end - 8) throw new Error('GLB must embed one nonempty buffer');
  let triangles = 0;
  const accessor = (index, positions = false) => {
    const item = doc.accessors?.[index];
    const view = doc.bufferViews?.[item?.bufferView];
    const width = positions ? 12 : ({ 5121: 1, 5123: 2, 5125: 4 })[item?.componentType];
    if (!item || item.sparse || !view || !width || !Number.isInteger(item.count) || item.count <= 0 ||
        item.type !== (positions ? 'VEC3' : 'SCALAR') || (positions && item.componentType !== 5126)) throw new Error('Invalid GLB accessor/reference');
    const stride = view.byteStride ?? width, start = item.byteOffset ?? 0;
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(stride) || stride < width || start + (item.count - 1) * stride + width > view.byteLength) throw new Error('GLB accessor exceeds buffer view');
    const base = end + 8 + (view.byteOffset ?? 0) + start;
    if (base + (item.count - 1) * stride + width > bytes.length) throw new Error('GLB accessor exceeds binary chunk');
    for (let i = 0; i < item.count; i++) {
      const at = base + i * stride;
      if (positions && ![0, 4, 8].every(delta => Number.isFinite(bytes.readFloatLE(at + delta)))) throw new Error('Nonfinite GLB position');
    }
    return { item, stride, base, width };
  };
  for (const mesh of doc.meshes || []) for (const primitive of mesh.primitives || []) {
    const positions = accessor(primitive.attributes?.POSITION, true).item;
    const indices = primitive.indices === undefined ? null : accessor(primitive.indices);
    if (!positions?.count || positions.type !== 'VEC3' || (primitive.mode ?? 4) !== 4) throw new Error('Missing triangle geometry');
    if (indices) for (let i = 0; i < indices.item.count; i++) if (bytes.readUIntLE(indices.base + i * indices.stride, indices.width) >= positions.count) throw new Error('GLB index exceeds vertex count');
    const count = indices?.item.count ?? positions.count;
    if (count % 3) throw new Error('Invalid triangle count');
    triangles += count / 3;
  }
  if (!triangles) throw new Error('Empty GLB geometry');
  for (const view of doc.bufferViews || []) {
    if ((view.buffer ?? 0) !== 0 || !Number.isInteger(view.byteLength) || view.byteLength <= 0 ||
        !Number.isInteger(view.byteOffset ?? 0) || (view.byteOffset ?? 0) < 0 ||
        (view.byteOffset ?? 0) + view.byteLength > doc.buffers[0].byteLength) throw new Error('Out-of-bounds GLB buffer view');
  }
  if ((doc.images || []).some(image => image.uri || !doc.bufferViews?.[image.bufferView])) throw new Error('GLB images must be embedded');
  return { triangles, images: doc.images?.length || 0, materials: doc.materials?.length || 0, sha256: hash(bytes), bytes: bytes.length, validation: 'bounded-structural-only' };
}

export function prepareWorkflow(template, schemas, filename, prefix) {
  const workflow = structuredClone(template);
  let loaders = 0;
  for (const [id, node] of Object.entries(workflow)) {
    const schema = schemas[node.class_type];
    if (!schema) throw new Error(`Missing ComfyUI node: ${node.class_type} (${id}); qualify the workflow, do not invent a fallback`);
    node.inputs ||= {};
    if (node.class_type === 'LoadImage') { node.inputs.image = filename; loaders++; }
    if ('filename_prefix' in node.inputs) node.inputs.filename_prefix = prefix;
    for (const [name, definition] of Object.entries(schema.input?.required || {})) {
      if (!(name in node.inputs)) throw new Error(`Missing required workflow input: ${id}.${name}`);
      const value = node.inputs[name];
      if (!Array.isArray(value) && Array.isArray(definition[0]) && name !== 'image' && !definition[0].includes(value)) throw new Error(`Unavailable model/option: ${id}.${name}=${value}`);
    }
  }
  if (loaders !== 1) throw new Error('Qualified workflow must have exactly one LoadImage node');
  return workflow;
}

export function modelOutput(history) {
  if (history.status?.status_str === 'error') throw new Error('ComfyUI execution failed: ' + JSON.stringify(history.status.messages || []));
  if (history.status?.completed !== true) return null;
  const outputs = Object.values(history.outputs || {}).flatMap(output => Object.values(output).flat());
  const files = outputs.filter(item => item && typeof item.filename === 'string' && /\.glb$/i.test(item.filename));
  if (files.length !== 1) throw new Error(`Completed workflow must return exactly one GLB descriptor; got ${files.length}`);
  const file = files[0];
  if (file.filename.includes('..') || /[\\/]/.test(file.filename) || (file.subfolder || '').split(/[\\/]/).includes('..') ||
      !['output', 'temp'].includes(file.type || 'output')) throw new Error('Unsafe ComfyUI output descriptor');
  return { filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' };
}

export async function runLocalComfyUI({ image, outputDir, objectId, workflowPath, server = 'http://127.0.0.1:8188', index = '0', preflight = false, timeoutMs = 900000, pollMs = 3000, fetchImpl = fetch }) {
  if (!image || !outputDir || !objectId || !workflowPath) throw new Error('Local 1K route requires image, output-dir, object-id and an explicit --workflow API JSON');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || !Number.isFinite(pollMs) || pollMs < 1) throw new Error('Timeout/poll interval must be positive');
  const base = new URL(server.includes('://') ? server : 'http://' + server);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Local route requires a loopback HTTP server');
  const input = await fs.readFile(image);
  inspectPng(input);
  const template = await readJson(workflowPath);
  const workerIdentity = `loopback:${base.port || 80}`;
  const prefix = `${index}-${objectId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  if (!/^\d+$/.test(String(index))) throw new Error('Attempt index must be a nonnegative integer');
  const sourceHash = hash(input);
  const fingerprint = hash(JSON.stringify({ sourceHash, template, server: workerIdentity, profile: 'local-1k-v1' }));
  const request = async (route, options = {}) => {
    const response = await fetchImpl(new URL(route, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`ComfyUI ${route}: HTTP ${response.status}`);
    return response;
  };
  if (preflight) {
    prepareWorkflow(template, await (await request('/object_info')).json(), path.basename(image), prefix);
    return { status: 'preflight-only', profile: 'local-1k-v1', source_sha256: sourceHash, workflow_sha256: hash(JSON.stringify(template)), nodes: Object.keys(template).length, inference_qualified: false };
  }
  await fs.mkdir(outputDir, { recursive: true });
  const stateFile = path.join(outputDir, prefix + '-comfy-state.json');
  const gpuLockPath = path.join(os.tmpdir(), `aass-comfy-${hash(workerIdentity).slice(0, 16)}.lock.sqlite`);
  const releaseGpu = await acquireLock(gpuLockPath);
  try {
  const releaseJob = await acquireLock(stateFile + '.lock.sqlite');
  try {
    let state = await readJson(stateFile).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (state && state.fingerprint !== fingerprint) throw new Error('Source/workflow/server changed; use a new attempt index or object ID');
    if (state?.status === 'downloaded') {
      const validation = inspectGlb(await fs.readFile(state.output_file));
      if (validation.sha256 !== state.validation.sha256) throw new Error('Previously downloaded GLB hash changed');
      return { provider: 'local-comfyui', status: 'downloaded-awaiting-review', downloaded_files: [{ path: state.output_file, label: 'model' }], validation, state_file: stateFile };
    }
    if (state?.status === 'submitting') throw new Error('Submission outcome unknown; reconcile ComfyUI queue/history before any retry');
    if (!state) {
      const workflow = prepareWorkflow(template, await (await request('/object_info')).json(), path.basename(image), prefix);
      const queue = await (await request('/queue')).json();
      if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending) || queue.queue_running.length || queue.queue_pending.length) throw new Error('ComfyUI queue busy or unknown; serialize GPU work and retry later');
      const stats = await (await request('/system_stats')).json();
      const gpu = stats.devices?.find(device => device.type === 'cuda');
      if (!gpu || !Number.isFinite(gpu.vram_free) || gpu.vram_free < 6 * 1024 ** 3) throw new Error('Local shape preflight requires a CUDA device with at least 6 GiB free; preserve other jobs and retry later');
      state = { fingerprint, source_sha256: sourceHash, profile: 'local-1k-v1', status: 'preparing', client_id: prefix + '-' + fingerprint.slice(0, 12) };
      const form = new FormData();
      form.append('image', new Blob([input], { type: 'image/png' }), `${sourceHash}.png`);
      const uploaded = await (await request('/upload/image', { method: 'POST', body: form })).json();
      if (!uploaded.name) throw new Error('Upload response missing image name');
      for (const node of Object.values(workflow)) if (node.class_type === 'LoadImage') node.inputs.image = [uploaded.subfolder, uploaded.name].filter(Boolean).join('/');
      state.status = 'submitting';
      await writeState(stateFile, state);
      const queued = await (await request('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: state.client_id, prompt: workflow }) })).json();
      if (!queued.prompt_id || Object.keys(queued.node_errors || {}).length) throw new Error('ComfyUI rejected workflow; inspect queue/history and saved submitting state');
      state.prompt_id = queued.prompt_id;
      state.status = 'submitted';
      await writeState(stateFile, state);
    }
    if (state.status !== 'submitted') throw new Error(`Cannot resume state ${state.status}`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const history = await (await request('/history/' + encodeURIComponent(state.prompt_id))).json();
      const entry = history[state.prompt_id];
      if (entry) {
        const descriptor = modelOutput(entry);
        if (descriptor) {
          const response = await request('/view?' + new URLSearchParams(descriptor));
          const bytes = Buffer.from(await response.arrayBuffer());
          const validation = inspectGlb(bytes);
          const destination = path.resolve(outputDir, prefix + '.glb');
          await fs.writeFile(destination + '.tmp', bytes);
          await fs.rename(destination + '.tmp', destination);
          Object.assign(state, { status: 'downloaded', output_file: destination, descriptor, validation });
          await writeState(stateFile, state);
          return { provider: 'local-comfyui', status: 'downloaded-awaiting-review', downloaded_files: [{ path: destination, label: 'model' }], validation, state_file: stateFile };
        }
      }
      await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
    throw new Error(`Polling timed out; rerun same command to resume prompt ${state.prompt_id}; do not regenerate`);
  } finally {
    await releaseJob();
  }
  } finally {
    await releaseGpu();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { values } = parseArgs({ options: Object.fromEntries(['image', 'output-dir', 'object-id', 'workflow', 'server', 'index', 'timeout-ms'].map(name => [name, { type: 'string' }]).concat([['preflight', { type: 'boolean' }]])) });
  runLocalComfyUI({ image: values.image, outputDir: values['output-dir'], objectId: values['object-id'], workflowPath: values.workflow, server: values.server, index: values.index, preflight: values.preflight, timeoutMs: Number(values['timeout-ms'] || 900000) })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(JSON.stringify({ status: 'blocked', error: error.message })); process.exitCode = 1; });
}
