import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ensureModels } from "../scripts/ensure-models.mjs";

async function fixture(t: { after: (fn: () => Promise<void>) => void }, corrupt = false) {
  const directory = await mkdtemp(join(tmpdir(), "visualshower-lfs-"));
  const model = Buffer.from("glTF-model-fixture");
  const oid = createHash("sha256").update(model).digest("hex");
  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${model.length}\n`;
  let batchRequests = 0;
  let endpoint = "";
  const server = createServer(async (request, response) => {
    if (request.url === "/batch") {
      ++batchRequests;
      let body = "";
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      assert.equal(data.operation, "download");
      assert.deepEqual(data.objects, [{ oid, size: model.length }]);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ objects: [{ oid, size: model.length, actions: { download: { href: endpoint.replace("/batch", "/model") } } }] }));
    } else if (request.url === "/model") {
      response.end(corrupt ? Buffer.alloc(model.length) : model);
    } else { response.writeHead(404).end(); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  endpoint = `http://127.0.0.1:${address.port}/batch`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + "visualshower-lfs-"));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, model, pointer, endpoint, requests: () => batchRequests };
}

test("keeps complete local GLB files without requesting a download", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, "model.glb"), f.model);
  await ensureModels(f.directory, f.endpoint);
  assert.deepEqual(await readFile(join(f.directory, "model.glb")), f.model);
  assert.equal(f.requests(), 0);
});

test("replaces a Git LFS pointer with the verified binary model", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, "model.glb"), f.pointer);
  await ensureModels(f.directory, f.endpoint);
  assert.deepEqual(await readFile(join(f.directory, "model.glb")), f.model);
  assert.equal(f.requests(), 1);
});

test("rejects corrupt downloads and preserves the original pointer", async (t) => {
  const f = await fixture(t, true);
  await writeFile(join(f.directory, "model.glb"), f.pointer);
  await assert.rejects(ensureModels(f.directory, f.endpoint), /SHA-256/);
  assert.equal(await readFile(join(f.directory, "model.glb"), "utf8"), f.pointer);
  assert.deepEqual(await readdir(f.directory), ["model.glb"]);
});
