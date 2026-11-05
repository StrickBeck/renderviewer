import { test } from "node:test";
import assert from "node:assert/strict";
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, Points, PointsMaterial, Texture } from "three";
import { disposeObject, loadModelFiles } from "../src/lib/load-model";
import { normalizeModel } from "../src/lib/model-utils";

test("opens OBJ geometry without requiring a WebGL context", async () => {
  const file = new File(["v 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3\n"], "triangle.obj");
  const model = await loadModelFiles([file]);
  assert.equal(model.format, "OBJ");
  assert.equal(model.name, "triangle.obj");
  const mesh = model.root.children[0].children[0] as Mesh;
  assert.equal(mesh.geometry.getAttribute("position").count, 3);
  assert.equal(normalizeModel(model.root).originalSize.x, 2);
  disposeObject(model.root);
});

test("opens ASCII STL and rejects a corrupt GLB with a readable error", async () => {
  const stl = "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle";
  const model = await loadModelFiles([new File([stl], "triangle.stl")]);
  assert.equal((model.root.children[0] as Mesh).geometry.getAttribute("position").count, 3);
  disposeObject(model.root);
  await assert.rejects(loadModelFiles([new File(["invalid"], "bad.glb")]), /Не удалось открыть модель/);
});

test("reads an embedded binary GLB using the actual GLTFLoader", async () => {
  const json = JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] });
  const jsonBytes = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const glb = new ArrayBuffer(12 + 8 + jsonBytes.length + 8 + 36);
  const view = new DataView(glb);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.byteLength, true);
  view.setUint32(12, jsonBytes.length, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(glb, 20, jsonBytes.length).set(jsonBytes);
  const bin = 20 + jsonBytes.length;
  view.setUint32(bin, 36, true); view.setUint32(bin + 4, 0x004e4942, true);
  new Float32Array(glb, bin + 8, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const model = await loadModelFiles([new File([glb], "triangle.glb")]);
  let vertices = 0;
  model.root.traverse((object) => { if (object instanceof Mesh) vertices += object.geometry.getAttribute("position").count; });
  assert.equal(vertices, 3);
  assert.equal(model.format, "GLB");
  disposeObject(model.root);
});

test("releases line and point geometry and their shared texture when replacing a model", () => {
  const root = new Group();
  const texture = new Texture();
  const lineMaterial = new LineBasicMaterial({ map: texture });
  const pointsMaterial = new PointsMaterial({ map: texture });
  const a = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 1, 0], 3));
  const b = a.clone();
  let geometries = 0, materials = 0, textures = 0;
  a.addEventListener("dispose", () => ++geometries);
  b.addEventListener("dispose", () => ++geometries);
  lineMaterial.addEventListener("dispose", () => ++materials);
  pointsMaterial.addEventListener("dispose", () => ++materials);
  texture.addEventListener("dispose", () => ++textures);
  root.add(new Line(a, lineMaterial), new Points(b, pointsMaterial));
  disposeObject(root);
  assert.equal(geometries, 2);
  assert.equal(materials, 2);
  assert.equal(textures, 1);
});
