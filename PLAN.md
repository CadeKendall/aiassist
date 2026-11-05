# Codex Visual Studio

Original local Windows learning workbench inspired by observed HeyClicky behavior. No proprietary code or binaries are incorporated.

## Scope and ownership
- Root: shared types/validation, scaffolding, Codex app-server adapter, preload/IPC, integration and proof.
- computer_science: renderer and hand-authored example scenes only.
- creative_research: React app interface, styles, browser fallback only.
- enterprise_lead: lesson persistence, desktop utility functions, tests for these modules.

## Design decisions
Electron + React + Three.js. Native window frame preserves Windows controls and Snap behavior; web content uses Segoe UI Variable. A teaching workbench: large visual canvas, compact discussion pane, prompt at bottom, selected-part detail beside the canvas. Warm ivory canvas with ink typography and restrained orange accent. Avoid card grids and decorative dashboard clutter. Resize to stacked panels on narrow windows. Keyboard-visible focus, labels, error/empty/loading states, reduced motion. Direct selection provides follow-up context. Desktop window plus optional always-on-top; Ctrl+Shift+Space focuses it.

Codex app-server has its own persistent thread. Structured JSON scene tools validate data and update the scene incrementally; generated JavaScript is never executed. Models run online; visualization/animation and saved lessons run locally. Examples remain usable without authentication. Numerical charts preserve supplied coordinates and show data provenance.

## Milestones
1. Shared contract, runnable window and Codex handshake.
2. Selectable animated 3D, numerical charts and diagrams.
3. Validated scene replacement/update tools and streamed explanation.
4. Follow-ups, cancellation, saved thread resume and lesson replay.
5. Hotkey, floating window, explicit screenshot attachment and import/export.
6. Speech playback and voice entry fallback, progressive drawing and performance checks.

## Proof required
Type check and production build; scene validation and patch rejection; storage round-trip and hostile path rejection; real renderer selection and chart data checks; actual Codex authentication/turn/tool integration where account/network permits. Report any distinction between fixtures and live model results.
