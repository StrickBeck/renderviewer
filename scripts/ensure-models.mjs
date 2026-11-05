import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { open, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_ENDPOINT = "https://github.com/StrickBeck/renderviewer.git/info/lfs/objects/batch";

export async function ensureModels(
  directory = fileURLToPath(new URL("../public/models/", import.meta.url)),
  endpoint = process.env.MODEL_LFS_ENDPOINT || DEFAULT_ENDPOINT,
) {
  for (const name of await readdir(directory)) {
    if (!name.toLowerCase().endsWith(".glb")) continue;
    const path = join(directory, name);
    const file = await open(path, "r");
    let header;
    try {
      const buffer = Buffer.alloc(256);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      header = buffer.subarray(0, bytesRead);
    } finally { await file.close(); }
    if (header.subarray(0, 4).toString() === "glTF") continue;

    const pointer = header.toString("utf8");
    const oid = /^oid sha256:([a-f0-9]{64})\r?$/m.exec(pointer)?.[1];
    const size = Number(/^size (\d+)\r?$/m.exec(pointer)?.[1]);
    if (!pointer.startsWith("version https://git-lfs.github.com/spec/v1") || !oid || !Number.isSafeInteger(size) || size < 12) {
      throw new Error(`${name}: expected a GLB model or a valid Git LFS pointer.`);
    }

    const batch = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json" },
      body: JSON.stringify({ operation: "download", transfers: ["basic"], objects: [{ oid, size }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!batch.ok) throw new Error(`${name}: Git LFS returned HTTP ${batch.status}.`);
    const manifest = await batch.json();
    const action = manifest.objects?.find((object) => object.oid === oid)?.actions?.download;
    if (!action?.href) throw new Error(`${name}: Git LFS did not return a model download. Check repository access and LFS availability.`);

    const response = await fetch(action.href, { headers: action.header || {}, signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`${name}: model download returned HTTP ${response.status}.`);
    const temporary = `${path}.${randomUUID()}.download`;
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      await pipeline(Readable.fromWeb(response.body), new Transform({
        transform(chunk, _encoding, done) {
          bytes += chunk.length;
          if (bytes > size) { done(new Error(`${name}: model download exceeds its declared size.`)); return; }
          hash.update(chunk);
          done(null, chunk);
        },
      }), createWriteStream(temporary, { flags: "wx" }));
      if (bytes !== size || hash.digest("hex") !== oid) throw new Error(`${name}: downloaded model failed size / SHA-256 verification.`);
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureModels().then(() => console.log("Model assets are ready.")).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
