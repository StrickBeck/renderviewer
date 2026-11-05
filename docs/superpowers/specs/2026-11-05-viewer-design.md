# VisualShower

Requested: a simple browser application using Next.js and Three.js with orbit and flight inspection.

Implementation choices: a local Next.js App Router project, TypeScript, direct Three.js integration, no server-side model storage. A light studio interface in Russian with a sidebar, large viewport, and built-in sculpture. Import GLB, GLTF (with companion files), OBJ (geometry), and STL. Use OrbitControls for orbiting and PointerLockControls plus camera-local movement for flight. Keep the current model if an import fails; release old GPU resources when replacing it. Frame models of arbitrary scale and handle narrow screens.

Approaches: direct Three.js is the smallest fit for this single viewer. React Three Fiber adds a second scene abstraction; a backend adds storage outside the requested scope. Neither is needed.

Controls: orbit with mouse/touch, fly with mouse and WASD, Q/E vertically, Shift to accelerate, Esc to release the pointer. Include fit/reset, grid, wireframe, auto-rotation, environment background, screenshot, fullscreen, and file errors. All model files remain local; any required Draco decoder is served from public/.

Validation: focused Node tests for file resolution, model normalization, framing and flight movement; TypeScript and production build; browser checks for render, mode switch and file import where the browser connection is available.
