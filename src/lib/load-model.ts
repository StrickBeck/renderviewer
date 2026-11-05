import { Group, Line, LoadingManager, Mesh, MeshStandardMaterial, Points, type AnimationClip, type Object3D, type WebGLRenderer, Texture, Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { resolveResourceFile, selectModelFile } from "./model-utils";

export type LoadedModel = { root: Group; animations: AnimationClip[]; name: string; format: string; bytes: number };

export function disposeObject(root: Object3D) {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return;
    object.geometry.dispose();
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
    if ("skeleton" in object) (object.skeleton as { dispose(): void }).dispose();
  });
  textures.forEach((texture) => {
    const image = texture.source?.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
    texture.dispose();
  });
  materials.forEach((material) => material.dispose());
}

export async function loadModelFiles(files: File[], renderer?: WebGLRenderer): Promise<LoadedModel> {
  const primary = selectModelFile(files);
  const format = primary.name.split(".").pop()!.toLowerCase();
  const root = new Group();
  const urls = new Map<File, string>();
  const manager = new LoadingManager();
  const base = primary.webkitRelativePath?.slice(0, primary.webkitRelativePath.lastIndexOf("/") + 1) || "";
  let resourceError = "";
  manager.setURLModifier((url) => {
    if (/^(data:|blob:|\/decoders\/)/i.test(url)) return url;
    try {
      const file = resolveResourceFile(url, files, base);
      if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
      return urls.get(file)!;
    } catch (error) {
      resourceError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
  manager.onError = () => { resourceError ||= "Не удалось прочитать текстуру или BIN-файл. Добавьте все файлы модели."; };
  const draco = new DRACOLoader().setDecoderPath("/decoders/draco/");
  const ktx = renderer ? new KTX2Loader().setTranscoderPath("/decoders/basis/").detectSupport(renderer) : null;
  try {
    let animations: AnimationClip[] = [];
    if (format === "glb" || format === "gltf") {
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
      if (ktx) loader.setKTX2Loader(ktx);
      const data = format === "gltf" ? await primary.text() : await primary.arrayBuffer();
      const gltf = await loader.parseAsync(data, "");
      root.add(gltf.scene);
      animations = gltf.animations;
    } else if (format === "obj") {
      root.add(new OBJLoader(manager).parse(await primary.text()));
    } else {
      const geometry = new STLLoader().parse(await primary.arrayBuffer());
      geometry.computeVertexNormals();
      root.add(new Mesh(geometry, new MeshStandardMaterial({ color: "#c9c9b2", roughness: 0.38, metalness: 0.08 })));
    }
    if (resourceError) throw new Error(resourceError);
    return { root, animations, name: primary.name, format: format.toUpperCase(), bytes: files.reduce((total, file) => total + file.size, 0) };
  } catch (error) {
    disposeObject(root);
    if (resourceError) throw new Error(resourceError);
    const detail = error instanceof Error ? error.message : "Неизвестная ошибка";
    throw new Error(`Не удалось открыть модель. Проверьте файл и его ресурсы. ${detail}`);
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
    draco.dispose();
    ktx?.dispose();
  }
}

