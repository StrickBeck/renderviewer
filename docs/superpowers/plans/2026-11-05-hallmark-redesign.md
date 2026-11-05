# Hallmark technical studio redesign

User requested Hallmark and selected Technical studio.

Scope: the existing `/` app screen. Use Hallmark v2 app-screen and full-redesign rules from the official Nutlope/hallmark repository. Preserve the current green identity, Russian copy facts and all file-loading, orbit, flight, screenshot, fullscreen, settings and error handlers.

Files: edit src/components/model-viewer.tsx and src/app/globals.css; add src/app/tokens.css and src/app/base.css from the Hallmark app scaffold. No routes or component trees removed. The imperative Three.js engine is unchanged.

Design: a restrained technical workbench with a large studio viewport, a compact inspector, consistent role-based colors, readable labels and clear active controls. Remove decorative tracked capitals, status dots, mixed meta punctuation and marketing filler. Keep the live 3D model as the visual focus. Use the existing system face so Cyrillic and offline startup remain reliable.

Validation: capture the current app with Hallmark --before, run app-scope --render --kept at eight widths, inspect before/after images, request one fresh review, then run the existing test suite, TypeScript and production build. Reuse the user's existing server on 127.0.0.1:3000. Hallmark browser tooling is isolated in .hallmark/tooling.

Completed: the official app-scope render check tested widths 320, 375, 414, 768, 1024, 1280, 1440 and 1920. Final checks report zero Floor failures and zero open Reflex findings. One Finish check is answered: selected camera modes and the model-fit button are contextual controls, not competing primary actions. The record preserves 1/1 fields and 33/33 handlers; two generic headings are reworded in the CSS stamp. A fresh screenshot review returned ship with no findings. The existing nine regression tests, TypeScript and production build pass.

Material: the live built-in Orbital study and user-imported 3D files; no photography or invented metrics. The phone inspector uses a single column for readable controls. Before/after captures and the comparison are in .hallmark/.
