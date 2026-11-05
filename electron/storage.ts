import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, unlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateLesson } from '../shared/scene';
import type { Lesson, LessonSummary } from '../shared/types';

export { validateLesson } from '../shared/scene';

export const MAX_LESSON_BYTES = 8 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function lessonId(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value)) {
    throw new Error('Lesson ID must be a safe filename identifier.');
  }
  return value;
}

/** Reads a bounded regular JSON file. Used by both local storage and the import dialog. */
export async function readLessonFile(path: string): Promise<Lesson> {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Lesson must be a regular file.');
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_LESSON_BYTES) throw new Error('Lesson exceeds the 8 MiB size limit or is not a file.');
    const data = await handle.readFile();
    if (data.byteLength > MAX_LESSON_BYTES) throw new Error('Lesson exceeds the 8 MiB size limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('Lesson file is not valid JSON.'); }
    const lesson = validateLesson(parsed);
    lessonId(lesson.id);
    return lesson;
  } finally { await handle.close(); }
}

export class LessonStore {
  readonly directory: string;
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(directory: string) { this.directory = resolve(directory); }

  private path(id: string): string { return join(this.directory, `${lessonId(id)}.json`); }

  private async sequential<T>(id: string, work: () => Promise<T>): Promise<T> {
    const earlier = this.pending.get(id) ?? Promise.resolve();
    const current = earlier.catch(() => undefined).then(work);
    this.pending.set(id, current);
    try { return await current; }
    finally { if (this.pending.get(id) === current) this.pending.delete(id); }
  }

  async list(): Promise<LessonSummary[]> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const lessons: LessonSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || !ID_PATTERN.test(entry.name.slice(0, -5))) continue;
      try {
        const lesson = await this.load(entry.name.slice(0, -5));
        lessons.push({ id: lesson.id, title: lesson.title, updatedAt: lesson.updatedAt });
      } catch {
        // A damaged or concurrently removed lesson does not hide the healthy lessons.
        // Keep the file untouched so the user can recover it manually.
      }
    }
    return lessons.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async save(value: Lesson): Promise<void> {
    const lesson = validateLesson(value);
    lessonId(lesson.id);
    // Capture the payload before awaiting, so caller mutation cannot change the write.
    const data = JSON.stringify(lesson, null, 2);
    if (Buffer.byteLength(data, 'utf8') > MAX_LESSON_BYTES) throw new Error('Lesson exceeds the 8 MiB size limit.');
    await this.sequential(lesson.id, async () => {
      await mkdir(this.directory, { recursive: true });
      const destination = this.path(lesson.id);
      const temporary = join(this.directory, `.${lesson.id}.${randomUUID()}.tmp`);
      let handle;
      try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(data, 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, destination);
      } finally {
        if (handle) await handle.close();
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      }
    });
  }

  async load(id: string): Promise<Lesson> {
    const normalized = lessonId(id);
    await this.pending.get(normalized);
    const lesson = await readLessonFile(this.path(normalized));
    if (lesson.id !== normalized) throw new Error('Lesson ID does not match its filename.');
    return lesson;
  }

  async delete(id: string): Promise<void> {
    const normalized = lessonId(id);
    await this.sequential(normalized, async () => {
      try { await unlink(this.path(normalized)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    });
  }
}
