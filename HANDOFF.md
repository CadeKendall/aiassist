# Handoff: AI Assist

## What the user wants
A local Windows visual learning app inspired by HeyClicky, using Codex on request to produce interactive 3D models, charts and diagrams. The user wants the visible app name to be AI Assist.

## Where things stand
Project: C:/Users/Temp/aiassist. Launch with Launch.cmd. Electron, React, Three.js and the installed Codex app-server provide the app. AI rendering instructions are validated JSON; model-generated JavaScript is not executed. Lessons and conversations can be saved.

Live tests previously verified exact chart data, follow-up edits, thread resumption, and a real desktop 3D generation and selected-part edit. A renderer agent reported chart/table height clipping and was interrupted before confirming a fix. Inspect the current files before assuming its final state.

## Next step
Review the AI Assist rename, rebuild the app, confirm existing lessons remain accessible, and inspect chart/table clipping. The user asked for a handoff file in this project folder.

## Decisions that must survive
- Preserve the Codex CLI executable, protocol identifiers, and login integration: these are functional dependencies.
- Do not incorporate proprietary HeyClicky binaries or scripts.
- Local rendering is illustrative, not a physical simulation or production CAD.

## Files and existing work
- src/App.tsx: user interface.
- src/SceneView.tsx: renderer.
- electron/assistant-backend.ts: app-server connection.
- shared/scene.ts: validation and drawing tools.
- README.md and PLAN.md: setup and design.
- C:/Users/Temp/heyclicky-research/findings.md: prior research.
