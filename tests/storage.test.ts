import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test, type TestContext } from 'node:test';
import { LessonStore, MAX_LESSON_BYTES, readLessonFile } from '../electron/storage';
import type { Lesson } from '../shared/types';

async function temporaryStore(t: TestContext): Promise<LessonStore> {
  const directory = await mkdtemp(join(tmpdir(), 'codex-visual-store-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('codex-visual-store-'));
    await rm(directory, { recursive: true, force: true });
  });
  return new LessonStore(directory);
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: randomUUID(), title: 'How a wheel rotates', updatedAt: '2026-11-01T12:00:00.000Z', threadId: randomUUID(),
    scene: { version: 1, title: 'Wheel', description: 'A labelled wheel.', kind: '3d', parts: [{ id: 'wheel', label: 'Wheel', shape: 'torus', position: [0, 0, 0], color: '#d76732' }], notes: [] },
    messages: [{ id: randomUUID(), role: 'user', text: 'Show me how the wheel rotates.' }], ...overrides,
  };
}

test('saved scenes and thread context survive a new store instance', async (t) => {
  const store = await temporaryStore(t);
  const input = lesson();
  await store.save(input);
  const reopened = new LessonStore(store.directory);
  assert.deepEqual(await reopened.load(input.id), input);
  assert.deepEqual(await reopened.list(), [{ id: input.id, title: input.title, updatedAt: input.updatedAt }]);
});

test('unsafe IDs cannot read, write or delete outside the lesson directory', async (t) => {
  const store = await temporaryStore(t);
  for (const id of ['../outside', '..\\outside', '/absolute', 'C:\\outside', 'lesson.json', 'x:stream', 'CON', 'lpt1', '']) {
    await assert.rejects(store.save(lesson({ id })));
    await assert.rejects(store.load(id));
    await assert.rejects(store.delete(id));
  }
  assert.deepEqual(await readdir(store.directory), []);
});

test('an invalid replacement leaves the last valid lesson intact', async (t) => {
  const store = await temporaryStore(t);
  const input = lesson();
  await store.save(input);
  const before = await readFile(join(store.directory, `${input.id}.json`), 'utf8');
  const invalid = structuredClone(input);
  invalid.scene.parts[0].position[0] = Number.NaN;
  await assert.rejects(store.save(invalid));
  assert.equal(await readFile(join(store.directory, `${input.id}.json`), 'utf8'), before);
  assert.deepEqual(await store.load(input.id), input);
});

test('concurrent saves are ordered and leave one complete JSON file', async (t) => {
  const store = await temporaryStore(t);
  const first = lesson({ title: 'First' });
  await Promise.all([store.save(first), store.save({ ...first, title: 'Second' })]);
  assert.equal((await store.load(first.id)).title, 'Second');
  assert.deepEqual(await readdir(store.directory), [`${first.id}.json`]);
});

test('corrupt and mismatched files do not hide valid lessons or get deleted', async (t) => {
  const store = await temporaryStore(t);
  const older = lesson();
  const newer = lesson({ updatedAt: '2026-11-02T12:00:00.000Z', title: 'Newer' });
  await store.save(older);
  await store.save(newer);
  const corrupt = randomUUID(), mismatch = randomUUID();
  await writeFile(join(store.directory, `${corrupt}.json`), '{broken');
  await writeFile(join(store.directory, `${mismatch}.json`), JSON.stringify(lesson()));
  await writeFile(join(store.directory, '.interrupted.tmp'), 'not a lesson');
  assert.deepEqual((await store.list()).map((item) => item.id), [newer.id, older.id]);
  await assert.rejects(store.load(corrupt), /JSON/);
  await assert.rejects(store.load(mismatch), /filename/);
  assert.equal(await readFile(join(store.directory, `${corrupt}.json`), 'utf8'), '{broken');
});

test('oversize imports and saves are rejected before replacing valid data', async (t) => {
  const store = await temporaryStore(t);
  const input = lesson();
  await store.save(input);
  const oversized = lesson({ id: input.id, messages: Array.from({ length: 200 }, () => ({ id: randomUUID(), role: 'assistant' as const, text: 'x'.repeat(49_000) })) });
  await assert.rejects(store.save(oversized));
  assert.deepEqual(await store.load(input.id), input);
  const file = join(store.directory, 'oversize.json');
  await writeFile(file, Buffer.alloc(MAX_LESSON_BYTES + 1, 32));
  await assert.rejects(readLessonFile(file), /size limit/);
});

test('imports accept UTF-8 BOM and validate message roles', async (t) => {
  const store = await temporaryStore(t);
  const input = lesson(), file = join(store.directory, 'import.json');
  await writeFile(file, `\uFEFF${JSON.stringify(input)}`);
  assert.deepEqual(await readLessonFile(file), input);
  await writeFile(file, JSON.stringify({ ...input, messages: [{ id: 'x', role: 'system', text: 'Untrusted role' }] }));
  await assert.rejects(readLessonFile(file));
});

test('delete waits for a pending save and is idempotent', async (t) => {
  const store = await temporaryStore(t);
  const input = lesson();
  await Promise.all([store.save(input), store.delete(input.id)]);
  await store.delete(input.id);
  await assert.rejects(store.load(input.id));
  assert.deepEqual(await store.list(), []);
});
