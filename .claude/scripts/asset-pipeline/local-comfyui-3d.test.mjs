import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { inspectGlb, inspectPng, prepareWorkflow, modelOutput, runLocalComfyUI } from './local-comfyui-3d.mjs';

const template = { 1: { class_type: 'LoadImage', inputs: { image: 'input.png' } }, 2: { class_type: 'SaveMesh', inputs: { filename_prefix: 'asset' } } };
const schemas = { LoadImage: { input: { required: { image: [['input.png']] } } }, SaveMesh: { input: { required: { filename_prefix: ['STRING'] } } } };
const complete = { status: { completed: true, status_str: 'success' }, outputs: { 2: { meshes: [{ filename: 'asset.glb', subfolder: 'nested/output', type: 'output' }] } } };
function glb() {
  const doc = { asset: { version: '2.0' }, buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const json = Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(JSON.stringify(doc).length / 4) * 4, ' '));
  const bytes = Buffer.alloc(28 + json.length + 36);
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  bytes.writeUInt32LE(36, 20 + json.length); bytes.writeUInt32LE(0x004e4942, 24 + json.length);
  return bytes;
}
function png(color = 0) {
  const chunk = (type, data) => {
    const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8); bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4); return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1024); header.writeUInt32BE(1024, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc(3073 * 1024, color); for (let i = 0; i < 1024; i++) raw[i * 3073] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-1k-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'input.png'), workflowPath = path.join(dir, 'workflow.json');
  await fs.writeFile(image, png()); await fs.writeFile(workflowPath, JSON.stringify(template));
  let posts = 0, pending = false, lost = false, bad = false, free = 7 * 1024 ** 3;
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/object_info') return Response.json(schemas);
    if (url.pathname === '/queue') return Response.json({ queue_running: [], queue_pending: [] });
    if (url.pathname === '/system_stats') return Response.json({ devices: [{ type: 'cuda', vram_free: free }] });
    if (url.pathname === '/upload/image') return Response.json({ name: 'server.png', subfolder: 'uploaded' });
    if (url.pathname === '/prompt') {
      posts++;
      const body = JSON.parse(options.body);
      assert.equal(body.prompt[1].inputs.image, 'uploaded/server.png');
      if (lost) throw new Error('lost POST response');
      return Response.json({ prompt_id: 'job-1' });
    }
    if (url.pathname === '/history/job-1') return Response.json(pending ? {} : { 'job-1': complete });
    if (url.pathname === '/view') {
      assert.equal(url.searchParams.get('subfolder'), 'nested/output');
      assert.equal(url.searchParams.get('type'), 'output');
      return new Response(bad ? Buffer.from('<html>not a mesh</html>') : glb());
    }
    throw new Error('Unexpected request ' + url);
  };
  return { options: { image, workflowPath, outputDir: path.join(dir, 'output'), objectId: 'espresso', fetchImpl, timeoutMs: 30, pollMs: 1 }, posts: () => posts, pending: value => pending = value, lost: () => lost = true, bad: () => bad = true, free: value => free = value };
}

test('preflight rejects missing nodes, models and required inputs', () => {
  assert.throws(() => prepareWorkflow(template, {}, 'x.png', 'x'), /Missing ComfyUI node/);
  assert.throws(() => prepareWorkflow({ ...template, 3: { class_type: 'Model', inputs: { ckpt: 'missing' } } }, { ...schemas, Model: { input: { required: { ckpt: [['installed']] } } } }, 'x.png', 'x'), /Unavailable model/);
  assert.throws(() => prepareWorkflow({ ...template, 2: { class_type: 'SaveMesh', inputs: {} } }, schemas, 'x.png', 'x'), /Missing required/);
});
test('history must complete and return one safe GLB descriptor', () => {
  assert.equal(modelOutput({}), null);
  assert.deepEqual(modelOutput(complete), complete.outputs[2].meshes[0]);
  assert.throws(() => modelOutput({ status: { completed: true }, outputs: {} }), /exactly one/);
  assert.throws(() => modelOutput({ status: { status_str: 'error', messages: ['OOM'] } }), /OOM/);
  assert.throws(() => modelOutput({ ...complete, outputs: { x: { meshes: [{ filename: '../x.glb' }] } } }), /Unsafe/);
});
test('reject HTML and incorrect GLB length', () => {
  assert.throws(() => inspectGlb(Buffer.from('<html>bad</html>')), /Invalid GLB/);
  const bytes = glb(); bytes.writeUInt32LE(1, 8);
  assert.throws(() => inspectGlb(bytes), /Invalid GLB/);
  assert.equal(inspectGlb(glb()).triangles, 1);
});
test('preflight never submits or creates output state', async t => {
  const f = await fixture(t);
  assert.equal((await runLocalComfyUI({ ...f.options, preflight: true })).inference_qualified, false);
  assert.equal(f.posts(), 0);
  await assert.rejects(fs.stat(f.options.outputDir), { code: 'ENOENT' });
});
test('download uses nested descriptor and hash-bound reuse', async t => {
  const f = await fixture(t);
  const first = await runLocalComfyUI(f.options);
  assert.equal(first.status, 'downloaded-awaiting-review');
  await runLocalComfyUI(f.options); assert.equal(f.posts(), 1);
  await fs.writeFile(first.downloaded_files[0].path, glb().subarray(1));
  await assert.rejects(runLocalComfyUI(f.options), /Invalid GLB/);
  assert.equal(f.posts(), 1);
});
test('poll timeout resumes same prompt without duplicate submission', async t => {
  const f = await fixture(t); f.pending(true);
  await assert.rejects(runLocalComfyUI(f.options), /Polling timed out/);
  f.pending(false); await runLocalComfyUI(f.options); assert.equal(f.posts(), 1);
});
test('ambiguous submission blocks retry', async t => {
  const f = await fixture(t); f.lost();
  await assert.rejects(runLocalComfyUI(f.options), /lost POST/);
  await assert.rejects(runLocalComfyUI(f.options), /Submission outcome unknown/);
  assert.equal(f.posts(), 1);
});
test('changed source cannot reuse a previous job', async t => {
  const f = await fixture(t); await runLocalComfyUI(f.options);
  await fs.writeFile(f.options.image, png(1));
  await assert.rejects(runLocalComfyUI(f.options), /Source\/workflow\/server changed/);
  assert.equal(f.posts(), 1);
});
test('invalid downloaded output cannot become success or trigger another job', async t => {
  const f = await fixture(t); f.bad();
  await assert.rejects(runLocalComfyUI(f.options), /Invalid GLB/);
  await assert.rejects(runLocalComfyUI(f.options), /Invalid GLB/); assert.equal(f.posts(), 1);
});
test('reject non-1K input and remote server before network activity', async t => {
  const f = await fixture(t);
  await assert.rejects(runLocalComfyUI({ ...f.options, server: 'https://example.com' }), /loopback/);
  const bytes = await fs.readFile(f.options.image); bytes.writeUInt32BE(4096, 16); await fs.writeFile(f.options.image, bytes);
  await assert.rejects(runLocalComfyUI(f.options), /PNG/); assert.equal(f.posts(), 0);
});
test('lock prevents parallel execution', async t => {
  const f = await fixture(t); await fs.mkdir(f.options.outputDir);
  const db = new DatabaseSync(path.join(f.options.outputDir, '0-espresso-comfy-state.json.lock.sqlite')); db.exec('BEGIN IMMEDIATE');
  try { await assert.rejects(runLocalComfyUI(f.options), /Job locked/); assert.equal(f.posts(), 0); }
  finally { db.close(); }
});
test('truncated and corrupt PNGs are rejected before upload', () => {
  assert.throws(() => inspectPng(png().subarray(0, 24)), /PNG/);
  const bytes = png(); bytes[40] ^= 1;
  assert.throws(() => inspectPng(bytes), /PNG/);
  assert.doesNotThrow(() => inspectPng(png()));
});
test('GLB rejects inaccessible positions and unresolved index accessors', () => {
  const bytes = glb();
  const end = 20 + bytes.readUInt32LE(12);
  const rewrite = doc => {
    const json = Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(JSON.stringify(doc).length / 4) * 4));
    const result = Buffer.alloc(28 + json.length + 36); bytes.copy(result, 0, 0, 20); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(json.length, 12); json.copy(result, 20); bytes.copy(result, 20 + json.length, end); return result;
  };
  const doc = JSON.parse(bytes.toString('utf8', 20, end));
  doc.accessors[0].count = 300;
  assert.throws(() => inspectGlb(rewrite(doc)), /accessor exceeds/);
  doc.accessors[0].count = 3; doc.meshes[0].primitives[0].indices = 99;
  assert.throws(() => inspectGlb(rewrite(doc)), /accessor\/reference/);
});
test('downloaded artifact reuses offline without current node schemas', async t => {
  const f = await fixture(t); await runLocalComfyUI(f.options);
  const offline = () => { throw new Error('server offline'); };
  assert.equal((await runLocalComfyUI({ ...f.options, fetchImpl: offline })).status, 'downloaded-awaiting-review');
});
test('killed owner recovers locks and resumes its submitted prompt', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const script = path.join(path.dirname(f.options.image), 'interrupted.mjs');
  await fs.writeFile(script, `import { runLocalComfyUI } from ${JSON.stringify(new URL('./local-comfyui-3d.mjs', import.meta.url).href)};
const schemas = ${JSON.stringify(schemas)};
const fetchImpl = async url => {
 if(url.pathname==='/object_info') return Response.json(schemas);
 if(url.pathname==='/queue') return Response.json({queue_running:[],queue_pending:[]});
 if(url.pathname==='/system_stats') return Response.json({devices:[{type:'cuda',vram_free:7*1024**3}]});
 if(url.pathname==='/upload/image') return Response.json({name:'server.png'});
 if(url.pathname==='/prompt') return Response.json({prompt_id:'job-1'});
 process.send('ready'); await new Promise(()=>{});
};
await runLocalComfyUI({...${JSON.stringify({ ...f.options, fetchImpl: undefined, timeoutMs: 900000 })},fetchImpl});`);
  const child = fork(script, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('Child exited before readiness'); })]);
  const ended = once(child, 'exit'); child.kill(); await ended;
  assert.equal((await runLocalComfyUI(f.options)).status, 'downloaded-awaiting-review');
  assert.equal(f.posts(), 0);
});
test('missing, malformed and insufficient VRAM cannot submit', async t => {
  const f = await fixture(t);
  for (const free of [undefined, 'unknown', '99999999999', 5 * 1024 ** 3]) {
    f.free(free); await assert.rejects(runLocalComfyUI(f.options), /6 GiB free/);
  }
  assert.equal(f.posts(), 0);
});
test('localhost and numeric loopback serialize on the same worker', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  let entered, release;
  const atQueue = new Promise(resolve => entered = resolve), barrier = new Promise(resolve => release = resolve);
  const first = runLocalComfyUI({ ...f.options, fetchImpl: async (url, options) => {
    if (url.pathname === '/queue') { entered(); await barrier; }
    return f.options.fetchImpl(url, options);
  } });
  await atQueue;
  try { await assert.rejects(runLocalComfyUI({ ...f.options, server: 'http://localhost:8188', outputDir: f.options.outputDir + '-other' }), /Job locked/); }
  finally { release(); }
  await first; assert.equal(f.posts(), 1);
});
test('process death during pre-submission lock ownership releases native lock', { timeout: 10000 }, async t => {
  const f = await fixture(t); await fs.mkdir(f.options.outputDir);
  const script = path.join(path.dirname(f.options.image), 'lock-owner.mjs');
  const dbPath = path.join(f.options.outputDir, '0-espresso-comfy-state.json.lock.sqlite');
  await fs.writeFile(script, `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(${JSON.stringify(dbPath)}); db.exec('BEGIN IMMEDIATE'); process.send('locked'); setInterval(()=>{},1000);`);
  const child = fork(script, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('Child exited before lock'); })]);
  await assert.rejects(runLocalComfyUI(f.options), /Job locked/);
  const ended = once(child, 'exit'); child.kill(); await ended;
  await runLocalComfyUI(f.options); assert.equal(f.posts(), 1);
});
