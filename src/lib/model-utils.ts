import { Box3, type Object3D, type Quaternion, Vector3 } from "three";

export function selectModelFile(files: File[]): File {
  if (!files.length) throw new Error("Выберите файл модели.");
  const models = files.filter((file) => /\.(glb|gltf|obj|stl)$/i.test(file.name));
  if (!models.length) throw new Error("Поддерживаются GLB, GLTF, OBJ и STL. Выберите файл модели.");
  if (models.length > 1) throw new Error("Откройте одну модель за раз вместе с её текстурами и BIN-файлами.");
  return models[0];
}

function cleanPath(value: string): string {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* A literal percent sign is also a valid filename. */ }
  const parts: string[] = [];
  for (const part of decoded.replaceAll("\\", "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export function resolveResourceFile(url: string, files: File[], rootPath: string): File {
  const path = cleanPath(rootPath + url);
  const direct = files.find((file) => cleanPath(file.webkitRelativePath || file.name) === path);
  if (direct) return direct;
  const basename = cleanPath(url).split("/").pop();
  const matches = files.filter((file) => file.name === basename);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Найдено несколько файлов «${basename}». Перетащите папку модели целиком.`);
  throw new Error(`Не найден файл «${url}». Добавьте его вместе с моделью или перетащите папку целиком.`);
}

export function normalizeModel(root: Object3D): { originalSize: Vector3; radius: number; center: Vector3 } {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const originalSize = box.getSize(new Vector3());
  const extent = Math.max(originalSize.x, originalSize.y, originalSize.z);
  if (box.isEmpty() || !Number.isFinite(extent) || extent <= 0) {
    throw new Error("В модели нет видимой геометрии.");
  }
  const scale = 3.2 / extent;
  const oldCenter = box.getCenter(new Vector3());
  root.scale.multiplyScalar(scale);
  root.position.multiplyScalar(scale).sub(oldCenter.multiplyScalar(scale));
  root.position.y += originalSize.y * scale / 2;
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  return { originalSize, radius: bounds.getSize(new Vector3()).length() / 2, center: bounds.getCenter(new Vector3()) };
}

export function fitDistance(radius: number, fov: number, aspect: number): number {
  const vertical = fov * Math.PI / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(0.05, aspect));
  return Math.max(radius, 0.1) / Math.sin(Math.min(vertical, horizontal)) * 1.16;
}

export function flightDirection(keys: ReadonlySet<string>, quaternion: Quaternion): Vector3 {
  const direction = new Vector3(
    Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft")),
    0,
    Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp")),
  ).applyQuaternion(quaternion);
  direction.y += Number(keys.has("KeyE") || keys.has("Space")) - Number(keys.has("KeyQ"));
  return direction.normalize();
}
