import {
  ACESFilmicToneMapping, AnimationMixer, Color, CylinderGeometry, DirectionalLight,
  Euler, GridHelper, Group, HemisphereLight, MathUtils, Mesh, MeshPhysicalMaterial,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Scene, ShadowMaterial, TorusKnotGeometry, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { disposeObject, loadModelFiles, type LoadedModel } from "./load-model";
import { fitDistance, flightDirection, normalizeModel } from "./model-utils";

export type ViewMode = "orbit" | "fly";
export type Background = "studio" | "warm" | "dark";
export const BACKGROUNDS: Record<Background, string> = { studio: "#eff0ea", warm: "#e9e2d6", dark: "#252c29" };
export type ViewerSettings = { background: Background; grid: boolean; wireframe: boolean; autoRotate: boolean; speed: number };
export type ModelInfo = { name: string; format: string; bytes: number; vertices: number; triangles: number; meshes: number; dimensions: number[]; demo: boolean };
type Callbacks = { onModel: (info: ModelInfo) => void; onLock: (locked: boolean) => void; onError: (message: string) => void };

export const DEFAULT_SETTINGS: ViewerSettings = { background: "studio", grid: true, wireframe: false, autoRotate: false, speed: 2.5 };

const DEFAULT_MODEL = { url: "/models/bsgno_threejs.glb", name: "bsgno_threejs.glb" };

function demoModel(): LoadedModel {
  const root = new Group();
  const sculpture = new Mesh(
    new TorusKnotGeometry(0.84, 0.285, 240, 40, 2, 3),
    new MeshPhysicalMaterial({ color: "#b9bb98", roughness: 0.31, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  );
  sculpture.rotation.set(0.12, 0.35, -0.25);
  sculpture.position.y = 1.72;
  root.add(sculpture);
  const base = new Mesh(new CylinderGeometry(1.28, 1.28, 0.22, 96), new MeshStandardMaterial({ color: "#dcdccf", roughness: 0.72 }));
  base.position.y = 0.11;
  root.add(base);
  const top = new Mesh(new CylinderGeometry(1.16, 1.16, 0.045, 96), new MeshStandardMaterial({ color: "#e4e4d6", roughness: 0.5 }));
  top.position.y = 0.24;
  root.add(top);
  return { root, animations: [], name: "Orbital study", format: "DEMO", bytes: 0 };
}

export class ViewerEngine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1, 0.01, 1000);
  private orbit: OrbitControls;
  private fly: PointerLockControls;
  private grid = new GridHelper(30, 60, "#b4bf9e", "#cdd4bf");
  private floor: Mesh;
  private model: Group | null = null;
  private modelCenter = new Vector3(0, 1.3, 0);
  private modelRadius = 2;
  private mixer: AnimationMixer | null = null;
  private environment;
  private mode: ViewMode = "orbit";
  private settings = { ...DEFAULT_SETTINGS };
  private keys = new Set<string>();
  private observer: ResizeObserver;
  private disposed = false;
  private loadVersion = 0;
  private lastTime = 0;
  private touchPoint: { x: number; y: number; id: number } | null = null;
  private abort = new AbortController();
  private initialResize = true;

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute("aria-label", "3D-сцена. Перетащите мышь для осмотра модели.");
    this.renderer.domElement.setAttribute("role", "img");
    host.appendChild(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.background = new Color(BACKGROUNDS.studio);
    this.scene.environmentIntensity = 0.8;
    this.scene.add(new HemisphereLight("#ffffff", "#b4b49d", 2.2));
    const sun = new DirectionalLight("#fff6e2", 3.5);
    sun.position.set(-3, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 25 });
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: 0.12 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.012;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid.position.y = -0.005;
    const materials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    materials.forEach((material) => { material.transparent = true; material.opacity = 0.37; material.depthWrite = false; });
    this.scene.add(this.grid);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;
    this.orbit.minDistance = 0.12;
    this.orbit.maxDistance = 150;
    this.orbit.maxPolarAngle = Math.PI * 0.94;
    this.orbit.autoRotateSpeed = 0.7;
    this.fly = new PointerLockControls(this.camera, this.renderer.domElement);
    this.fly.enabled = false;
    this.fly.pointerSpeed = 0.7;
    this.fly.addEventListener("lock", this.onLock);
    this.fly.addEventListener("unlock", this.onUnlock);

    const options = { signal: this.abort.signal };
    window.addEventListener("keydown", this.onKeyDown, options);
    window.addEventListener("keyup", this.onKeyUp, options);
    window.addEventListener("blur", this.clearKeys, options);
    document.addEventListener("visibilitychange", this.clearKeys, options);
    document.addEventListener("pointerlockerror", this.onLockError, options);
    this.renderer.domElement.addEventListener("click", this.onCanvasClick, options);
    this.renderer.domElement.addEventListener("pointerdown", this.onTouchStart, options);
    this.renderer.domElement.addEventListener("pointermove", this.onTouchMove, options);
    this.renderer.domElement.addEventListener("pointerup", this.onTouchEnd, options);
    this.renderer.domElement.addEventListener("pointercancel", this.onTouchEnd, options);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost, options);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(this.animate);
  }

  private onLock = () => { this.clearKeys(); this.callbacks.onLock(true); };
  private onUnlock = () => { this.clearKeys(); this.callbacks.onLock(false); };
  private onLockError = () => this.callbacks.onError("Браузер не включил управление мышью. Нажмите на сцену ещё раз. Для выхода используйте Esc.");
  private onContextLost = (event: Event) => { event.preventDefault(); this.callbacks.onError("Графический контекст потерян. Обновите страницу, чтобы восстановить 3D-сцену."); };
  private clearKeys = () => { this.keys.clear(); this.touchPoint = null; };
  private onCanvasClick = (event: MouseEvent) => {
    if (this.mode === "fly" && !this.fly.isLocked && (event as PointerEvent).pointerType !== "touch" && !matchMedia("(pointer: coarse)").matches) this.startFlight();
  };
  private onKeyDown = (event: KeyboardEvent) => {
    if (this.mode !== "fly" || !this.fly.isLocked) return;
    if (/^(Key[WASDQE]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight)$/.test(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private onTouchStart = (event: PointerEvent) => {
    if (this.mode !== "fly" || event.pointerType === "mouse") return;
    this.touchPoint = { x: event.clientX, y: event.clientY, id: event.pointerId };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private onTouchMove = (event: PointerEvent) => {
    if (!this.touchPoint || this.touchPoint.id !== event.pointerId || this.mode !== "fly") return;
    const angles = new Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    angles.y -= (event.clientX - this.touchPoint.x) * 0.004;
    angles.x = MathUtils.clamp(angles.x - (event.clientY - this.touchPoint.y) * 0.004, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.camera.quaternion.setFromEuler(angles);
    this.touchPoint.x = event.clientX;
    this.touchPoint.y = event.clientY;
  };
  private onTouchEnd = () => { this.touchPoint = null; };

  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    const oldAspect = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.model && this.mode === "orbit" && (this.initialResize || Math.abs(oldAspect - this.camera.aspect) > 0.3)) this.reset();
    this.initialResize = false;
  };

  setMode(mode: ViewMode) {
    if (this.mode === mode) return;
    this.clearKeys();
    if (this.fly.isLocked) this.fly.unlock();
    this.mode = mode;
    this.orbit.enabled = mode === "orbit";
    this.fly.enabled = mode === "fly";
    if (mode === "orbit") {
      this.orbit.target.copy(this.modelCenter);
      this.orbit.update();
    }
  }

  setSettings(settings: ViewerSettings) {
    this.settings = { ...settings };
    this.scene.background = new Color(BACKGROUNDS[settings.background]);
    this.grid.visible = settings.grid;
    // Rotation starts only after an explicit user choice, even with reduced motion.
    this.orbit.autoRotate = settings.autoRotate;
    this.applyWireframe();
  }

  private applyWireframe() {
    this.model?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => { if ("wireframe" in material) material.wireframe = this.settings.wireframe; });
    });
  }

  async loadFiles(files: File[]) {
    const version = ++this.loadVersion;
    const loaded = await loadModelFiles(files, this.renderer);
    if (this.disposed || version !== this.loadVersion) { disposeObject(loaded.root); return; }
    try { this.replaceModel(loaded, false); }
    catch (error) { disposeObject(loaded.root); throw error; }
  }

  async loadDefault() {
    const version = ++this.loadVersion;
    const response = await fetch(DEFAULT_MODEL.url, { signal: this.abort.signal });
    if (!response.ok) throw new Error(`Файл стартовой модели недоступен (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (this.disposed || version !== this.loadVersion) return;
    await this.loadFiles([new File([blob], DEFAULT_MODEL.name, { type: "model/gltf-binary" })]);
  }

  showDemo() {
    ++this.loadVersion;
    this.replaceModel(demoModel(), true);
  }

  private replaceModel(loaded: LoadedModel, demo: boolean) {
    // Validate and frame the replacement before releasing the current model.
    const { radius, center, originalSize } = normalizeModel(loaded.root);
    let vertices = 0, triangles = 0, meshes = 0;
    loaded.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      vertices += object.geometry.getAttribute("position")?.count || 0;
      triangles += (object.geometry.index?.count || object.geometry.getAttribute("position")?.count || 0) / 3;
      ++meshes;
    });
    this.mixer?.stopAllAction();
    if (this.model) {
      this.mixer?.uncacheRoot(this.model);
      this.scene.remove(this.model);
      disposeObject(this.model);
    }
    this.model = loaded.root;
    this.modelCenter.copy(center);
    this.modelRadius = radius;
    this.scene.add(this.model);
    this.mixer = loaded.animations.length ? new AnimationMixer(this.model) : null;
    if (this.mixer) this.mixer.clipAction(loaded.animations[0]).play();
    this.applyWireframe();
    this.reset();
    this.callbacks.onModel({ name: loaded.name, format: loaded.format, bytes: loaded.bytes, vertices, triangles: Math.round(triangles), meshes, dimensions: originalSize.toArray(), demo });
  }

  reset() {
    this.clearKeys();
    const distance = fitDistance(this.modelRadius, this.camera.fov, this.camera.aspect);
    this.orbit.target.copy(this.modelCenter);
    this.camera.position.copy(new Vector3(0.9, 0.5, 1.35).normalize().multiplyScalar(distance).add(this.modelCenter));
    this.camera.lookAt(this.modelCenter);
    this.camera.updateMatrixWorld();
    this.orbit.update();
  }

  startFlight() {
    if (this.mode !== "fly" || matchMedia("(pointer: coarse)").matches) return;
    if (!this.renderer.domElement.requestPointerLock) { this.callbacks.onError("Свободный полёт мышью не поддерживается этим браузером. Откройте приложение в Chrome, Edge или Firefox."); return; }
    try { this.fly.lock(); } catch { this.onLockError(); }
  }

  setMoveKey(code: string, pressed: boolean) {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  private animate = (time: number) => {
    const delta = Math.min((time - (this.lastTime || time)) / 1000, 0.05);
    this.lastTime = time;
    if (this.disposed || document.hidden) return;
    if (this.mode === "orbit") this.orbit.update(delta);
    else if (this.keys.size) {
      const boost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 3 : 1;
      this.camera.position.addScaledVector(flightDirection(this.keys, this.camera.quaternion), this.settings.speed * boost * delta);
    }
    this.mixer?.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  async screenshot(): Promise<void> {
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob | null>((resolve) => this.renderer.domElement.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Не удалось сохранить изображение.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `visualshower-${Date.now()}.png`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  dispose() {
    this.disposed = true;
    ++this.loadVersion;
    this.abort.abort();
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.clearKeys();
    this.fly.removeEventListener("lock", this.onLock);
    this.fly.removeEventListener("unlock", this.onUnlock);
    if (this.fly.isLocked) this.fly.unlock();
    this.fly.dispose();
    this.orbit.dispose();
    this.mixer?.stopAllAction();
    if (this.model) this.mixer?.uncacheRoot(this.model);
    disposeObject(this.scene);
    this.scene.traverse((object) => { if (object instanceof DirectionalLight) object.shadow.dispose(); });
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
