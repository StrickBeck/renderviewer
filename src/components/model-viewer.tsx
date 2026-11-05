"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Box, Check, ChevronRight,
  CircleHelp, Expand, Eye, Focus, Grid2X2, ImageDown, Keyboard, Layers3,
  Mouse, Move, Orbit, Plus, RotateCcw, RotateCw,
  ScanLine, ShieldCheck, Sparkles, Upload, X,
} from "lucide-react";
import type { Background, ModelInfo, ViewerEngine, ViewerSettings, ViewMode } from "@/lib/viewer-engine";
import { filesFromDrop } from "@/lib/drop-files";

const INITIAL_SETTINGS: ViewerSettings = { background: "studio", grid: true, wireframe: false, autoRotate: false, speed: 2.5 };
const BACKGROUNDS: { id: Background; color: string; label: string }[] = [
  { id: "studio", color: "var(--color-viewport-studio)", label: "Студия" },
  { id: "warm", color: "var(--color-viewport-warm)", label: "Тёплый" },
  { id: "dark", color: "var(--color-viewport-dark)", label: "Тёмный" },
];
const number = new Intl.NumberFormat("ru-RU");
function fileSize(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function Toggle({ label, icon, value, onChange }: { label: string; icon: React.ReactNode; value: boolean; onChange: () => void }) {
  return <div className="toggle-row">
    <span className="toggle-label">{icon}{label}</span>
    <button className={`switch ${value ? "on" : ""}`} type="button" role="switch" aria-checked={value} aria-label={label} onClick={onChange}><i /></button>
  </div>;
}

export default function ModelViewer() {
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const engine = useRef<ViewerEngine | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dragDepth = useRef(0);
  const [mode, setMode] = useState<ViewMode>("orbit");
  const [settings, setSettings] = useState<ViewerSettings>(INITIAL_SETTINGS);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [locked, setLocked] = useState(false);
  const [help, setHelp] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/viewer-engine").then(({ ViewerEngine }) => {
      if (cancelled || !host.current) return;
      try {
        const viewer = new ViewerEngine(host.current, { onModel: setModel, onLock: setLocked, onError: setError });
        engine.current = viewer;
        setLoading(true);
        setReady(true);
        void viewer.loadDefault().catch((cause: unknown) => {
          if (cancelled) return;
          viewer.showDemo();
          const detail = cause instanceof Error ? cause.message : "Проверьте файл модели.";
          setError(`Не удалось открыть стартовую модель. ${detail}`);
        }).finally(() => { if (!cancelled) setLoading(false); });
      } catch (cause) {
        setFatal(cause instanceof Error ? cause.message : "Не удалось создать WebGL-сцену.");
      }
    }).catch(() => { if (!cancelled) setFatal("Не удалось загрузить 3D-модуль. Обновите страницу."); });
    const media = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener("change", update);
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; media.removeEventListener("change", update); };
  }, []);

  useEffect(() => { engine.current?.setMode(mode); }, [mode, ready]);
  useEffect(() => { engine.current?.setSettings(settings); }, [settings, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (help && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!help && dialog.current?.open) dialog.current.close();
  }, [help]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || help || loading || !ready) return;
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === "Digit1") { setMode("orbit"); event.preventDefault(); }
      if (event.code === "Digit2") { setMode("fly"); event.preventDefault(); }
      if (event.code === "KeyF") { engine.current?.reset(); event.preventDefault(); }
      if (event.code === "KeyG") { setSettings((value) => ({ ...value, grid: !value.grid })); event.preventDefault(); }
      if (event.key === "?" && !locked) { setHelp(true); event.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, loading, ready, locked]);

  const load = useCallback(async (files: File[]) => {
    if (!engine.current || !files.length) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try { await engine.current.loadFiles(files); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть модель."); }
    finally { setLoading(false); }
  }, []);

  const chooseFiles = () => { if (ready && !loading) input.current?.click(); };
  const toggle = (key: "grid" | "wireframe" | "autoRotate") => setSettings((value) => ({ ...value, [key]: !value[key] }));
  const saveScreenshot = async () => {
    try { await engine.current?.screenshot(); setNotice("Изображение сохранено в PNG"); }
    catch { setError("Не удалось сохранить изображение. Попробуйте ещё раз."); }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (viewport.current?.requestFullscreen) await viewport.current.requestFullscreen();
      else setError("Полноэкранный режим не поддерживается этим браузером.");
    } catch { setError("Не удалось перейти в полноэкранный режим."); }
  };
  const resetDemo = async () => {
    if (!engine.current || loading) return;
    setError(null);
    setLoading(true);
    try { await engine.current.loadDefault(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть стартовую модель."); }
    finally { setLoading(false); }
  };
  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (loading || !ready) return;
    try {
      // Capture File System Entries synchronously before yielding the drop event.
      const files = filesFromDrop(event.dataTransfer);
      await load(await files);
    } catch { setError("Не удалось прочитать папку. Выберите файлы через кнопку «Открыть модель»."); }
  };

  return <div className="app" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => event.preventDefault()}>
    <input ref={input} type="file" multiple hidden aria-label="Файлы 3D-модели" accept=".glb,.gltf,.obj,.stl,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.avif,.mtl" onChange={(event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      void load(files);
    }} />

    <header className="header">
      <div className="brand">
        <div className="brand-symbol"><Box size={23} strokeWidth={1.35} /></div>
        <div className="brand-name">visual<span>shower</span></div>
        <div className="brand-tag">Ваше пространство для 3D</div>
      </div>
      <div className="header-actions">
        <span className="local-badge"><ShieldCheck size={15} strokeWidth={1.5} />Работает в вашем браузере</span>
        <button className="primary-button" onClick={chooseFiles} disabled={!ready || loading} aria-busy={loading}><Plus size={16} strokeWidth={1.7} />{loading ? "Открываем модель…" : "Открыть модель"}</button>
      </div>
    </header>

    <div className="workspace">
      <aside className="sidebar" aria-label="Настройки сцены">
        <section>
          <div className="section-title"><h2>Сцена</h2><span>{model ? "1 объект" : "—"}</span></div>
          <div className="scene-item">
            <div className="model-thumb"><Box size={25} strokeWidth={1.1} /></div>
            <div className="model-detail"><div className="model-name" title={model?.name}>{model?.name || "Загрузка сцены…"}</div><div className="model-kind">{model?.demo ? "Демонстрационная модель" : model ? <><span>{model.format}</span><span>{fileSize(model.bytes)}</span></> : "Подготовка пространства"}</div></div>
            <Eye className="visible-icon" size={15} strokeWidth={1.5} aria-label="Модель видима" />
          </div>
          <button className="drop-zone" onClick={chooseFiles} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} disabled={!ready || loading}>
            <Upload size={23} strokeWidth={1.25} />
            <strong>Перетащите или <span>выберите файл</span></strong>
          </button>
          <p className="file-formats">GLB, GLTF, OBJ, STL</p>
        </section>

        <section className="sidebar-section">
          <div className="section-title"><h2>Отображение</h2><Layers3 size={13} strokeWidth={1.5} /></div>
          <div className="setting-label">Фон пространства</div>
          <div className="backgrounds" aria-label="Фон пространства">
            {BACKGROUNDS.map((background) => <button key={background.id} className={`swatch ${settings.background === background.id ? "active" : ""}`} aria-pressed={settings.background === background.id} aria-label={`Фон: ${background.label}`} onClick={() => setSettings((value) => ({ ...value, background: background.id }))}>
              <span className="swatch-color" style={{ background: background.color }} /><span className="swatch-label">{background.label}</span>
            </button>)}
          </div>
          <Toggle label="Сетка пола" icon={<Grid2X2 size={15} strokeWidth={1.4} />} value={settings.grid} onChange={() => toggle("grid")} />
          <Toggle label="Каркас модели" icon={<ScanLine size={15} strokeWidth={1.4} />} value={settings.wireframe} onChange={() => toggle("wireframe")} />
          <Toggle label="Автовращение" icon={<RotateCw size={15} strokeWidth={1.4} />} value={settings.autoRotate} onChange={() => toggle("autoRotate")} />
          {mode === "fly" && <><label htmlFor="speed" className="speed-label"><span>Скорость полёта</span><span>{settings.speed.toFixed(1)}×</span></label><input id="speed" className="speed-range" type="range" min="0.5" max="8" step="0.5" value={settings.speed} onChange={(event) => setSettings((value) => ({ ...value, speed: Number(event.target.value) }))} /></>}
        </section>

        <section className="sidebar-section stats-section">
          <div className="section-title"><h2>О модели</h2><Box size={13} strokeWidth={1.5} /></div>
          <div className="stats">
            <div><span className="stat-label">Вершины</span><span className="stat-value">{model ? number.format(model.vertices) : "—"}</span></div>
            <div><span className="stat-label">Треугольники</span><span className="stat-value">{model ? number.format(model.triangles) : "—"}</span></div>
            <div><span className="stat-label">Меши</span><span className="stat-value">{model ? String(model.meshes).padStart(2, "0") : "—"}</span></div>
            <div><span className="stat-label">Формат</span><span className="stat-value">{model?.demo ? <small>Встроенная сцена</small> : model?.format || "—"}</span></div>
          </div>
          {model && !model.demo && <button className="demo-button" onClick={resetDemo} disabled={loading}><RotateCcw size={12} />Вернуть стартовую модель</button>}
        </section>

        <div className="sidebar-bottom">
          <div className="private-note"><ShieldCheck size={16} strokeWidth={1.4} /><div><strong>Ваши модели остаются у вас</strong><p>Файлы открываются локально<br />и не отправляются на сервер.</p></div></div>
          <div className="version"><span>VisualShower</span><span>v1.0</span></div>
        </div>
      </aside>

      <main className="main">
        <div className="main-heading">
          <div><h1>Просмотр модели</h1><p>Откройте модель. Выберите ракурс. Исследуйте детали.</p></div>
        </div>

        <div ref={viewport} className={`viewport-card ${settings.background === "dark" ? "dark-view" : ""}`}
          onDragEnter={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); ++dragDepth.current; setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={handleDrop}>
          <div className="viewport-toolbar">
            <div className="mode-switch" role="group" aria-label="Режим осмотра">
              <button className={`mode-button ${mode === "orbit" ? "active" : ""}`} aria-pressed={mode === "orbit"} onClick={() => setMode("orbit")}><Orbit size={15} strokeWidth={1.5} />Орбита<kbd>1</kbd></button>
              <button className={`mode-button ${mode === "fly" ? "active" : ""}`} aria-pressed={mode === "fly"} onClick={() => setMode("fly")}><Move size={14} strokeWidth={1.5} />Полёт<kbd>2</kbd></button>
            </div>
            <div className="toolbar-actions">
              <button className="icon-button" title="Вернуть модель в кадр (F)" aria-label="Сбросить камеру" onClick={() => engine.current?.reset()} disabled={!ready}><RotateCcw size={15} strokeWidth={1.5} /></button>
              <button className="icon-button" title="Сохранить PNG" aria-label="Сохранить изображение" onClick={() => void saveScreenshot()} disabled={!ready}><ImageDown size={16} strokeWidth={1.5} /></button>
              <div className="toolbar-separator" />
              <button className="icon-button" title="На весь экран" aria-label="Полноэкранный режим" onClick={() => void fullscreen()}><Expand size={16} strokeWidth={1.5} /></button>
              <button className="icon-button" title="Управление (?)" aria-label="Помощь с управлением" onClick={() => setHelp(true)}><CircleHelp size={16} strokeWidth={1.5} /></button>
            </div>
          </div>

          <div className="canvas-area">
            <div ref={host} className="canvas-host" />
            <div className="viewport-topline"><span>Перспектива</span><span className="view-tag"><Sparkles size={12} />Студийный свет</span></div>

            {mode === "fly" && !locked && !coarse && ready && !loading && <button className="flight-prompt" title="Нажмите на сцену, чтобы начать полёт" onClick={() => engine.current?.startFlight()}><Mouse size={15} strokeWidth={1.5} />Начать полёт<ChevronRight size={12} /></button>}
            {mode === "fly" && locked && <div className="crosshair" />}
            {mode === "fly" && coarse && <div className="mobile-controls" aria-label="Перемещение в полёте">
              {[["KeyQ", "Q", "Вниз"], ["KeyW", "↑", "Вперёд"], ["KeyE", "E", "Вверх"], ["KeyA", "←", "Влево"], ["KeyS", "↓", "Назад"], ["KeyD", "→", "Вправо"]].map(([code, label, name]) => <button key={code} aria-label={name} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setMoveKey(code, true); }} onPointerUp={() => engine.current?.setMoveKey(code, false)} onPointerCancel={() => engine.current?.setMoveKey(code, false)} onLostPointerCapture={() => engine.current?.setMoveKey(code, false)}>{label}</button>)}
            </div>}

            <div className="model-caption"><div className="caption-number">{model?.demo ? "Демонстрационная модель" : "Файл модели"}</div><strong>{model?.name.replace(/\.(glb|gltf|obj|stl)$/i, "") || "Ваше пространство"}</strong><small>{model?.demo ? "Исследуйте форму со всех сторон" : "Локальная модель готова к осмотру"}</small></div>
            <div className="axis-widget" title="Обозначения осей"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M31 35V10M31 35 10 48M31 35l22 13" fill="none" strokeWidth="1.2" stroke="var(--color-view-muted)" /><circle cx="31" cy="35" r="3" fill="var(--color-view-ink)" /><text x="28" y="7" fill="var(--color-axis-y)">Y</text><text x="3" y="55" fill="var(--color-axis-x)">X</text><text x="55" y="55" fill="var(--color-axis-z)">Z</text></svg></div>
            <button className="fit-button" onClick={() => engine.current?.reset()} disabled={!ready}><Focus size={14} strokeWidth={1.5} />Модель в кадр<kbd>F</kbd></button>

            {(!ready || loading) && !fatal && <div className="loading-overlay" role="status"><div className="spinner" /><span>{loading ? "Открываем вашу модель…" : "Готовим 3D-пространство…"}</span></div>}
            {fatal && <div className="loading-overlay" role="alert"><AlertCircle size={28} /><strong>Не удалось запустить 3D</strong><span className="fatal-detail">{fatal}</span><button className="primary-button" onClick={() => location.reload()}>Попробовать снова</button></div>}
            {notice && <div className="notice" role="status"><Check size={14} />{notice}</div>}
          </div>

          <div className="viewport-footer" aria-live="polite">
            {mode === "orbit" ? <><span className="hint"><Mouse size={13} /><span>ЛКМ: вращение</span></span><span className="hint"><Move size={12} /><span>ПКМ: перемещение</span></span><span className="hint"><Mouse size={13} /><span>Колесо: масштаб</span></span></> : coarse ? <><span className="hint">Проведите по сцене: осмотр</span><span className="hint">Кнопки: перемещение</span></> : <><span className="hint"><kbd>W A S D</kbd><span>движение</span></span><span className="hint"><kbd>Q / E</kbd><span>вниз / вверх</span></span><span className="hint"><kbd>Shift</kbd><span>быстрее</span></span><span className="hint"><kbd>Esc</kbd><span>курсор</span></span></>}
          </div>
          {dragging && <div className="drag-overlay"><Upload size={42} strokeWidth={1} /><strong>Отпустите модель здесь</strong><span>Можно перетащить папку с текстурами целиком</span></div>}
          {error && <div className="error-toast" role="alert"><AlertCircle size={16} strokeWidth={1.5} /><p>{error}</p><button aria-label="Закрыть сообщение об ошибке" onClick={() => setError(null)}><X size={14} /></button></div>}

          <dialog ref={dialog} className="help-dialog" onClose={() => setHelp(false)} onCancel={() => setHelp(false)} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setHelp(false); } }} aria-labelledby="help-title">
            <div className="help-heading"><h2 id="help-title">Управление моделью</h2><button className="icon-button" aria-label="Закрыть помощь" onClick={() => setHelp(false)}><X size={18} /></button></div>
            <h3><Orbit size={15} />Орбита <kbd className="keycap">1</kbd></h3>
            <div className="help-row"><span>Вращение вокруг модели</span><span>ЛКМ + движение мыши</span></div>
            <div className="help-row"><span>Сдвиг камеры</span><span>ПКМ + движение мыши</span></div>
            <div className="help-row"><span>Приближение и отдаление</span><span>Колесо / жест двумя пальцами</span></div>
            <h3><Move size={15} />Свободный полёт <kbd className="keycap">2</kbd></h3>
            <div className="help-row"><span>Включить осмотр мышью</span><span>Нажать на 3D-сцену</span></div>
            <div className="help-row"><span>Вперёд / назад / в стороны</span><kbd className="keycap">W A S D</kbd></div>
            <div className="help-row"><span>Вниз / вверх</span><kbd className="keycap">Q / E</kbd></div>
            <div className="help-row"><span>Ускорение / освободить курсор</span><span><kbd className="keycap">Shift</kbd> / <kbd className="keycap">Esc</kbd></span></div>
            <h3><Keyboard size={15} />Быстрые действия</h3>
            <div className="help-row"><span>Вернуть модель в кадр / сетка</span><span><kbd className="keycap">F</kbd> / <kbd className="keycap">G</kbd></span></div>
            <p className="help-note">Для GLTF выберите модель вместе с BIN-файлом и текстурами или перетащите папку целиком. OBJ открывается как геометрия. Модели остаются в вашем браузере.</p>
          </dialog>
        </div>

        <footer className="footer"><span className="renderer-status">{ready ? "Сцена готова" : fatal ? "3D недоступно" : "Инициализация"}<span className="renderer-detail">/ WebGL 2</span></span><button onClick={() => setHelp(true)}><Keyboard size={14} strokeWidth={1.5} />Управление и сочетания клавиш</button></footer>
      </main>
    </div>
  </div>;
}
