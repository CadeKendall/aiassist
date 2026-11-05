# AI Assist

A local Windows visual-learning workbench: ask Codex for a 3D explanation, numerical chart or diagram, select a part, then ask a follow-up. This is an original implementation. It does not bundle HeyClicky binaries or drawing scripts.

## Open the app

Double-click **Launch.cmd** in this folder. Keep the folder intact: this development build uses its local Electron runtime and dependencies.

For a fresh checkout, install Node.js and the Codex CLI, sign in with `codex login`, then run:

```
npm install
npm run build
npm start
```

The **Connect** control uses your installed Codex CLI and its existing login. Model requests use your account and need an internet connection. The app starts its own conversation; it does not control or read this Codex chat. Examples, animation, diagrams, charts and saved lessons work locally. `CODEX_EXECUTABLE` can specify an absolute native Codex executable when it is not found automatically.

## Try it

- Open the piston example, orbit the model, select the piston and ask, “Highlight this part and explain what it does.”
- Ask, “Plot these measurements: (0, 2), (1, 4), (2, 3). X is time in seconds; Y is position in meters.” Then ask to recolor the series without changing the numbers.
- Ask for a diagram of how a water cycle works. Select a stage and ask for more detail.
- Save a lesson, close the app and reopen it. Loading restores the visual and conversation; your next request resumes the saved Codex thread.

Use the pin control for an always-on-top window. Ctrl+Shift+Space brings it forward. Screenshot attachment is explicit: choose a screen/window, inspect the preview, then send your request. An attachment is sent to Codex with that request, not continuously. Saved lesson JSON contains the scene and discussion, not screenshot pixels. Narration uses the operating system's speech voices. If in-app dictation is unavailable, focus the prompt and use Windows **Win+H**.

## Architecture

Electron main process owns the Codex child process, local persistence and narrowly scoped desktop operations. A sandboxed renderer owns React, Three.js and SVG; it has no Node access. Codex uses local app-server JSON-RPC over stdio, with streamed text and experimental dynamic drawing tools. `replace_scene` and `update_scene` accept bounded, validated JSON. No model-generated JavaScript is executed. Named parts and full current scene state carry selection context into follow-ups.

The tutor uses a read-only Codex sandbox, disables shell/app tools in its configuration, declines system approval requests, and asks the model to use only drawing tools. It inherits the installed CLI's authentication and applicable managed configuration. Its isolated working directory is inside app data. It does not change your global Codex settings.

Lesson files live in the app's user-data `lessons` directory (normally `%APPDATA%/aiassist/lessons`). Export/import JSON is portable; imported conversation IDs can resume only when that Codex thread is available under the current login. If a thread is unavailable, start a new lesson with the imported visual as context.

## Limits of this first version

The geometry vocabulary is boxes, spheres, cylinders, cones, tori and arrows composed into models; it does not generate downloadable production meshes or import arbitrary CAD assets. Animations are local rotations/translations, not physically simulated mechanisms. Charts display explicit numerical samples and provenance; the app cannot independently guarantee scientific claims from a model. Scene changes appear when each complete drawing tool call arrives, rather than partially executing streamed code. Narration reads completed explanations; word-level synchronization is not implemented. Built-in speech recognition depends on runtime support; Windows dictation remains the fallback.

The app-server dynamic-tool protocol is experimental. The integration was implemented against local Codex CLI 0.166.0. A CLI upgrade may require an adapter update. This is a runnable local development build, not a signed installer or an auto-updating distribution.

## Checks

```
npm test          # validation and persistence tests
npm run build    # TypeScript and production bundles
npm run test:ui  # Electron interaction tests
npm run test:live # small real model calls using existing Codex account
```

Live checks incur ordinary account usage. Evidence and test screenshots are written under `.smoke-data/` (ignored by version control). Test fixtures are separate from live model proof.

Official integration reference: [Codex app-server](https://learn.chatgpt.com/docs/app-server).
