import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const project = process.cwd();
const userData = path.join(project, '.smoke-data', `ui-${Date.now()}`);
let application: ElectronApplication;
let page: Page;
const errors: string[] = [];

async function launch() {
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STUDIO_USER_DATA = userData;
  application = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: project, env });
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await expect(page.getByRole('heading', { name: 'Inside a piston', exact: true })).toBeVisible();
}

test.describe.serial('Local visual workbench', () => {
  test.beforeAll(async () => { await mkdir(userData, { recursive: true }); await launch(); });
  test.afterAll(async () => { if (application) await application.close(); });

  test('renders actual 3D geometry and supports canvas and keyboard part selection', async () => {
    const canvas = page.locator('.scene-viewport canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByText('3D display unavailable', { exact: true })).toHaveCount(0);
    const rendered = await canvas.evaluate(element => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
    expect(rendered.width).toBeGreaterThan(200); expect(rendered.height).toBeGreaterThan(200);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    // Camera is fit to the model. Its middle intersects the visible piston/rod assembly.
    await canvas.click({ position: { x: bounds!.width * 0.5, y: bounds!.height * 0.5 } });
    await expect(page.locator('.selection-panel h3')).toBeVisible();
    const piston = page.locator('.scene-part-picker').getByRole('button', { name: 'Piston', exact: true });
    await piston.focus(); await page.keyboard.press('Enter');
    await expect(piston).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.selection-panel h3')).toHaveText('Piston');
    await expect(page.locator('.selection-panel')).toContainText('moves back and forth');
    await page.screenshot({ path: path.join(project, '.smoke-data', 'workbench.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(canvas).toBeVisible();
  });

  test('preserves exact chart values and exposes real axes and source', async () => {
    await page.getByRole('button', { name: 'Read a chart', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'When a faster start changes the story', exact: true })).toBeVisible();
    await expect(page.locator('.scene-chart-plot')).toContainText('Practice time (minutes)');
    await expect(page.locator('.scene-chart-plot')).toContainText('Quiz score (%)');
    await expect(page.locator('.scene-data-source')).toContainText('not study results');
    await page.getByRole('button', { name: 'Session A', exact: true }).click();
    await expect(page.locator('.selection-panel h3')).toHaveText('Session A');
    await page.getByText('View exact data', { exact: false }).click();
    const rows = page.locator('.scene-data-details tbody tr');
    await expect(rows).toHaveCount(10);
    expect(await rows.nth(1).locator('th,td').allTextContents()).toEqual(['Session A', '10', '48', '—']);
    expect(await rows.nth(8).locator('th,td').allTextContents()).toEqual(['Session B', '30', '72', '—']);
    await rows.nth(8).scrollIntoViewIfNeeded();
    await expect(rows.nth(8)).toBeInViewport();
    await expect(page.locator('.scene-series[aria-pressed="true"]')).toHaveCount(1);
    await page.screenshot({ path: path.join(project, '.smoke-data', 'chart.png'), fullPage: true });
  });

  test('a fixture follow-up recolors a part without resetting the orbit view', async () => {
    await page.getByRole('button', { name: 'Explore a piston', exact: false }).click();
    const canvas = page.locator('.scene-viewport canvas');
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.5);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * 0.72, bounds.y + bounds.height * 0.58, { steps: 14 }); await page.mouse.up();
    // Wait for OrbitControls damping to settle by observing an actual label's transform.
    const label = page.locator('.scene-model-label').filter({ hasText: /^Cylinder head$/ });
    let previous = '';
    await expect.poll(async () => { const current = await label.getAttribute('style'); const settled = current === previous; previous = current || ''; return settled; }, { intervals: [150, 250, 350] }).toBe(true);
    const before = await label.boundingBox();
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      // This is a deterministic transport fixture. It makes no model call.
      ipcMain.removeHandler('studio:connect');
      ipcMain.handle('studio:connect', () => ({ state: 'ready', message: 'UI test fixture', model: 'fixture' }));
      ipcMain.removeHandler('studio:ask');
      ipcMain.handle('studio:ask', (_event, request) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.webContents.send('studio:event', { type: 'scene', scene: { ...request.scene, parts: request.scene.parts.map((part: { id: string }) => part.id === 'piston' ? { ...part, color: '#447788' } : part) } });
        window.webContents.send('studio:event', { type: 'delta', text: 'Fixture: piston recolored.' });
        window.webContents.send('studio:event', { type: 'done', status: 'completed' });
      });
    });
    await page.getByRole('button', { name: 'Connect Codex', exact: true }).click();
    await page.getByLabel('Ask Codex to explain something visually').fill('Recolor the piston.');
    await page.getByRole('button', { name: 'Ask Codex', exact: true }).click();
    await expect(page.getByText('Fixture: piston recolored.', { exact: true })).toBeVisible();
    await expect.poll(async () => label.count()).toBe(1);
    const after = await label.boundingBox();
    expect(Math.abs(before!.x - after!.x)).toBeLessThan(2);
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(2);
  });

  test('diagram selection, local saving and library restore work', async () => {
    await page.getByRole('button', { name: 'Follow a process', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'How a question becomes a picture', exact: true })).toBeVisible();
    const validationNode = page.locator('.scene-diagram-node').filter({ hasText: 'Scene validation' });
    await validationNode.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.selection-panel h3')).toHaveText('Scene validation');
    await expect(page.locator('.scene-diagram-edge')).toHaveCount(5);
    await page.screenshot({ path: path.join(project, '.smoke-data', 'diagram.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New lesson', exact: true }).click();
    await expect(page.getByText('Your next question has a shape.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.locator('.lesson-open').filter({ hasText: 'How a question becomes a picture' }).first().click();
    await expect(page.getByRole('heading', { name: 'How a question becomes a picture', exact: true })).toBeVisible();
    await expect(page.locator('.scene-diagram-node')).toHaveCount(5);
  });

  test('saved lessons survive restart; reduced motion and narrow layout remain usable', async () => {
    await application.close(); await launch();
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.locator('.lesson-open').filter({ hasText: 'How a question becomes a picture' }).first().click();
    await expect(page.locator('.scene-diagram-node')).toHaveCount(5);
    await page.getByRole('button', { name: 'Explore a piston', exact: false }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByText('Motion reduced to match your settings', { exact: true })).toBeVisible();
    await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(800, 760); });
    await expect(page.locator('.scene-viewport canvas')).toBeVisible();
    await expect(page.locator('.scene-part-picker').getByRole('button', { name: 'Piston', exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
    expect(errors).toEqual([]);
  });
});
