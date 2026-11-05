import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

for (const [source, destination] of [["draco/gltf", "draco"], ["basis", "basis"]]) {
  const target = new URL(`../public/decoders/${destination}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  await cp(fileURLToPath(new URL(`../node_modules/three/examples/jsm/libs/${source}/`, import.meta.url)), fileURLToPath(target), { recursive: true });
}
