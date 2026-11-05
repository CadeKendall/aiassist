import type { AppEvent, Connection, Lesson, StudioBridge } from '../shared/types';
import { validateLesson } from '../shared/scene';

const KEY = 'codex-visual-studio.lessons.v1';
const desktopMessage = 'AI Assist needs the desktop app. You can explore examples and save lessons in this browser.';

function readLessons(): Lesson[] {
  const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (!Array.isArray(raw)) throw new Error('Your browser lesson library could not be read. Export any open lesson before clearing browser storage.');
  return raw.map(validateLesson);
}

function importFile(): Promise<Lesson | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.append(input);
    const finish = () => input.remove();
    input.addEventListener('cancel', () => { finish(); resolve(null); }, { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      try {
        if (!file) { resolve(null); return; }
        if (file.size > 5 * 1024 * 1024) throw new Error('Choose a lesson JSON file smaller than 5 MB.');
        resolve(validateLesson(JSON.parse(await file.text())));
      } catch (error) { reject(error); } finally { finish(); }
    }, { once: true });
    input.click();
  });
}

export function createBrowserBridge(): StudioBridge {
  const listeners = new Set<(event: AppEvent) => void>();
  const emit = (event: AppEvent) => listeners.forEach(listener => listener(event));
  return {
    async connect() {
      const connection: Connection = { state: 'disconnected', message: desktopMessage };
      emit({ type: 'connection', connection });
      return connection;
    },
    async ask() { throw new Error(desktopMessage); },
    async cancel() {},
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async listLessons() { return readLessons().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, title, updatedAt }) => ({ id, title, updatedAt })); },
    async saveLesson(lesson) {
      const valid = validateLesson(lesson);
      const lessons = readLessons().filter(item => item.id !== valid.id);
      localStorage.setItem(KEY, JSON.stringify([valid, ...lessons]));
    },
    async loadLesson(id) {
      const lesson = readLessons().find(item => item.id === id);
      if (!lesson) throw new Error('That lesson is no longer in this browser.');
      return lesson;
    },
    async deleteLesson(id) { localStorage.setItem(KEY, JSON.stringify(readLessons().filter(item => item.id !== id))); },
    async exportLesson(lesson) {
      const data = JSON.stringify(validateLesson(lesson), null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${lesson.title.replace(/[^a-z0-9 _-]/gi, '').slice(0, 60) || 'lesson'}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    },
    importLesson: importFile,
    async setAlwaysOnTop() { throw new Error('Keep on top is available in the desktop app.'); },
    async listScreens() { throw new Error('Screen capture is available in the desktop app.'); },
    async captureScreen() { throw new Error('Screen capture is available in the desktop app.'); },
  };
}

export const isDesktop = Boolean(window.studio);
export const studio = window.studio || createBrowserBridge();
