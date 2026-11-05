import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, Group, Mesh, Quaternion, Vector3 } from "three";
import { fitDistance, flightDirection, normalizeModel, resolveResourceFile, selectModelFile } from "../src/lib/model-utils";

test("selects a model rather than its texture and rejects ambiguous model sets", () => {
  const files = [new File([""], "wood.png"), new File([""], "scene.GLB")];
  assert.equal(selectModelFile(files), files[1]);
  assert.throws(() => selectModelFile([files[0]]), /GLB/);
  assert.throws(() => selectModelFile([]), /файл/);
  assert.throws(() => selectModelFile([files[1], new File([""], "other.obj")]), /одну/);
});

test("resolves encoded resources relative to the model and rejects ambiguous basenames", () => {
  const file = (name: string, path: string) => Object.assign(new File([""], name), { webkitRelativePath: path });
  const a = file("wood grain.png", "asset/textures/wood grain.png");
  const b = file("wood grain.png", "other/wood grain.png");
  assert.equal(resolveResourceFile("textures/wood%20grain.png", [a, b], "asset/"), a);
  assert.equal(resolveResourceFile("wood%20grain.png", [a], ""), a);
  assert.throws(() => resolveResourceFile("wood%20grain.png", [a, b], ""), /несколько/);
  assert.throws(() => resolveResourceFile("missing.bin", [a], ""), /missing.bin/);
});

test("normalizes an offset model to the floor at a useful scale", () => {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(200, 400, 100));
  mesh.position.set(1000, -500, 200);
  root.add(mesh);
  const result = normalizeModel(root);
  const bounds = new Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.min.y) < 0.00001);
  assert.ok(Math.abs(bounds.getCenter(new Vector3()).x) < 0.00001);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).y - 3.2) < 0.00001);
  assert.deepEqual(result.originalSize.toArray(), [200, 400, 100]);
  assert.throws(() => normalizeModel(new Group()), /геометр/);
});

test("fits the whole bounding sphere in a narrow viewport", () => {
  const wide = fitDistance(2, 45, 1.7);
  const narrow = fitDistance(2, 45, 0.5);
  assert.ok(wide > 2 / Math.sin(Math.PI / 8));
  assert.ok(narrow > wide * 1.8);
  assert.ok(Number.isFinite(fitDistance(0, 45, 1)));
});

test("flight follows camera pitch and keeps diagonal speed constant", () => {
  const pitched = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 4);
  const forward = flightDirection(new Set(["KeyW"]), pitched);
  assert.ok(forward.y > 0.7);
  assert.ok(forward.z < -0.7);
  const diagonal = flightDirection(new Set(["KeyW", "KeyD", "KeyE"]), new Quaternion());
  assert.ok(Math.abs(diagonal.length() - 1) < 0.00001);
  assert.equal(flightDirection(new Set(["KeyW", "KeyS"]), pitched).length(), 0);
});
