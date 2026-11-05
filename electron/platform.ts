import { desktopCapturer, dialog, globalShortcut, screen, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { MAX_LESSON_BYTES, readLessonFile, validateLesson } from './storage';
import type { Lesson, ScreenSource } from '../shared/types';

const FOCUS_HOTKEY = 'CommandOrControl+Shift+Space';
const screenChoices = new Map<string, { displayId: string; expires: number }>();

/** Small previews are local. A full capture requires choosing one of these sources. */
export async function listScreens(): Promise<ScreenSource[]> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 200 } });
  screenChoices.clear();
  const expires = Date.now() + 5 * 60_000;
  return sources.map((source) => {
    screenChoices.set(source.id, { displayId: source.display_id, expires });
    return { id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() };
  });
}

export async function captureScreen(id: string): Promise<string> {
  if (typeof id !== 'string') throw new Error('Choose a screen before capturing.');
  const chosen = screenChoices.get(id);
  if (!chosen || chosen.expires < Date.now()) throw new Error('Choose a screen again before capturing.');
  const display = screen.getAllDisplays().find((item) => String(item.id) === chosen.displayId);
  if (!display) throw new Error('The selected display is no longer connected. Choose a screen again.');
  const width = Math.round(display.size.width * display.scaleFactor);
  const height = Math.round(display.size.height * display.scaleFactor);
  const ratio = Math.min(1, 2560 / Math.max(width, height));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) } });
  const source = sources.find((item) => item.id === id && item.display_id === chosen.displayId);
  if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the selected screen.');
  screenChoices.delete(id);
  const jpeg = source.thumbnail.toJPEG(85);
  if (jpeg.byteLength > 10 * 1024 * 1024) throw new Error('Screen image is too large.');
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

export async function exportLesson(window: BrowserWindow, value: Lesson): Promise<boolean> {
  const lesson = validateLesson(value);
  const data = JSON.stringify(lesson, null, 2);
  if (Buffer.byteLength(data, 'utf8') > MAX_LESSON_BYTES) throw new Error('Lesson exceeds the 8 MiB size limit.');
  const safeTitle = lesson.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 100) || 'lesson';
  const result = await dialog.showSaveDialog(window, {
    title: 'Export lesson', defaultPath: `${safeTitle}.json`,
    filters: [{ name: 'Visual Studio lesson', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, data, { encoding: 'utf8', mode: 0o600 });
  return true;
}

export async function importLesson(window: BrowserWindow): Promise<Lesson | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Import lesson', properties: ['openFile'],
    filters: [{ name: 'Visual Studio lesson', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = result.filePaths[0];
  try { return await readLessonFile(path); }
  catch (error) { throw new Error(`Could not import ${basename(path)}: ${error instanceof Error ? error.message : 'Invalid lesson.'}`); }
}

export function registerFocusHotkey(window: BrowserWindow): () => void {
  const registered = globalShortcut.register(FOCUS_HOTKEY, () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    window.webContents.send('studio:event', { type: 'focus' });
  });
  if (!registered) console.warn(`The focus shortcut ${FOCUS_HOTKEY} is already in use or unavailable.`);
  return () => { if (registered) globalShortcut.unregister(FOCUS_HOTKEY); };
}
