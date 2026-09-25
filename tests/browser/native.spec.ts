import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { test, login, openGraphPerson, selectGraphView } from './support';
async function edit(page: Page, id = 'person_a') { await page.goto(`/?person=${id}&action=edit`); await expect(page.locator('#editDialog')).toBeVisible(); }
async function save(page: Page) {
  await page.goto('/?view=admin');
  const response = page.waitForResponse(r => r.url().endsWith('/save-family'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#adminSync').click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  expect(await result.json()).toMatchObject({ mode: 'local', branch: 'fixture-save' });
  await expect(page.locator('#adminSync')).toBeDisabled();
  await expect(page.locator('.workspace[aria-busy]')).toHaveAttribute('aria-busy', 'false');
}

test('legacy bookmarks redirect with chapter and section intact', async ({ page }) => {
  await login(page);
  await page.goto('/legacy.html?view=chronicle&chapter=intro.md#anfang');
  await expect(page).toHaveURL(/\/\?view=chronicle&chapter=intro.md#anfang$/);
  await expect(page.locator('#anfang')).toBeInViewport();
  await expect(page.locator('article')).toContainText('Testgeschichte');
  await expect(page.locator('#svelte-app')).toBeVisible();
  await page.goto('/legacy.html?person=person_c&action=descendants');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await expect(page.locator('[data-family-person="person_c"]')).toBeVisible();
  await page.goto('/legacy.html'); await expect(page.locator('.family-lines')).toBeVisible();
});

test('hourglass, descendants, search, button zoom and dragging use shared cards', async ({ page, isMobile }) => {
  await login(page);
  await page.goto('/?view=overview');
  await expect(page.locator('[data-family-person="person_d"]')).toHaveCount(0);
  await page.goto('/?view=overview&person=person_c&action=descendants');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await selectGraphView(page, 'hourglass');
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  if (!isMobile) {
    const svg = page.locator('.family-plane');
    await svg.scrollIntoViewIfNeeded(); const before = await svg.getAttribute('style');
    await page.getByRole('button', { name: 'Vergrössern', exact: true }).click();
    await expect(svg).not.toHaveAttribute('style', before!);
    const label = page.locator('[data-family-person="person_a"] .person-open'); await label.scrollIntoViewIfNeeded(); const box = (await label.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 4 }); await page.mouse.up();
    await expect(page.locator('#personDialog')).toHaveCount(0);
  }
  await openGraphPerson(page, 'person_a', isMobile);
  await expect(page.locator('#personDialog')).toContainText('Test Anna');
});


test('photo crop and source upload survive draft reload, real sync and queued deletion', async ({ page }, testInfo) => {
  await login(page); await edit(page);
  const label = `Dokument ${testInfo.project.name}`, filename = `native-${testInfo.project.name}.pdf`;
  await page.locator('#personEditor [name="occupation"]').fill(`Mit Medien ${testInfo.project.name}`);
  await page.locator('#srcLabel').fill(label);
  await page.locator('#srcFile').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nsynthetic\n%%EOF') });
  await page.locator('#srcUpload').click();
  await expect(page.locator('#editDialog a').filter({ hasText: label })).toHaveAttribute('href', /^blob:/);
  await page.locator('#photoFile').setInputFiles('tests/fixtures/archive/public/photos/test.png');
  await expect(page.locator('#photoCanvas')).toBeVisible();
  await page.locator('#photoUpload').click();
  await expect(page.locator('#editDialog img.portrait')).toBeVisible();
  await expect(page.locator('#personEditor [name="occupation"]')).toHaveValue(`Mit Medien ${testInfo.project.name}`);
  await page.locator('#personEditor button[type="submit"]').click();
  await page.reload();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  await edit(page);
  await expect(page.locator('#editDialog img.portrait')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#editDialog a').filter({ hasText: label })).toHaveAttribute('href', /^blob:/);
  await page.locator('#personEditor button[type="submit"]').click(); await save(page);
  const persisted = YAML.parse(await (await page.request.get('/data/trees/demo.yaml')).text());
  expect(persisted.people.person_a.photo).toBe(draft.people.person_a.photo);
  expect((await page.request.get(persisted.people.person_a.photo)).headers()['content-type']).toContain('image/jpeg');
  expect(await (await page.request.get(`/sources/${filename}`)).text()).toContain('synthetic');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await edit(page);
  await expect(page.locator('#editDialog img.portrait')).toHaveAttribute('src', persisted.people.person_a.photo);
  await page.locator('#photoRemove').click(); await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?view=sources'); await page.locator('#sourcesSearch').fill(label);
  const accept = (dialog: import('@playwright/test').Dialog) => dialog.accept(); page.on('dialog', accept);
  await page.locator(`[data-delete-source="/sources/${filename}"]`).click();
  await expect(page.locator('.source-doc')).toHaveCount(0);
  await expect(page.locator('.workspace[aria-busy]')).toHaveAttribute('aria-busy', 'false'); page.off('dialog', accept);
  // Files still exist until the YAML no longer references them and sync succeeds.
  expect((await page.request.get(`/sources/${filename}`)).status()).toBe(200);
  await save(page);
  expect((await page.request.get(`/sources/${filename}`)).status()).toBe(404);
  expect((await page.request.get(persisted.people.person_a.photo)).status()).toBe(404);
});

test('chronicle editor preserves drafts, validates links and persists Markdown and index', async ({ page }, testInfo) => {
  await login(page); await page.goto('/?view=chronicle');

  await page.locator('#chapterNew').click();
  const title = `New ${testInfo.project.name}`, filename = `new-${testInfo.project.name}.md`;
  await page.locator('#chTitle').fill(title);
  await page.locator('#chDate').fill('2001-02-03'); await page.locator('#chDateClear').click();
  await expect(page.locator('#chDate')).toHaveValue('');
  await page.locator('#chBody').fill('## Memory\n[[p:missing]] [[s:/sources/test.pdf]]');
  await page.locator('#chSave').click(); await expect(page.locator('#chStatus')).toContainText('missing');
  const body = '## Memory\n[[p:person_a]] [[s:/sources/test.pdf]] [[c:intro.md#anfang]]';
  await page.locator('#chBody').fill(body); await page.locator('#chPreviewBtn').click();
  await expect(page.locator('#chPreview a.chronicle-source')).toHaveAttribute('href', '/sources/test.pdf');
  await page.locator('#chPreview [data-person="person_a"]').click(); await expect(page.locator('#personDialog')).toContainText('Test Anna');
  await page.locator('#personDialog .dialog-close').click(); await page.locator('#chSave').click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await page.locator('[data-chapter=""]').click(); await page.locator(`[data-chapter="${filename}"]`).click();
  await expect(page.locator('article')).toContainText(title);
  await page.locator('#chapterEdit').click(); await expect(page.locator('#chBody')).toHaveValue(body);
  await page.locator('#chBody').fill('Nicht übernommene Änderung'); await page.locator('#chCancel').click();
  await expect(page.locator('article')).not.toContainText('Nicht übernommene');
  await save(page);
  expect(await (await page.request.get(`/chronicle/demo/${filename}`)).text()).toContain(body);
  expect(await (await page.request.get('/chronicle/demo/index.yaml')).text()).toContain(filename);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/legacy.html?view=chronicle&chapter=${filename}#memory`);
  await expect(page.locator('article')).toContainText(title);
  await page.locator('article [data-section="anfang"]').click(); await expect(page.locator('#anfang')).toBeInViewport();
});

test('new dataset, relationship picker, plain merge, deletion, exports and discard', async ({ page }, testInfo) => {
  await login(page); await page.goto('/?view=admin');
  const name = `native_${testInfo.project.name}`;
  page.once('dialog', async first => { page.once('dialog', second => second.accept('Startperson')); await first.accept(name); });
  await page.locator('#treeCreate').click(); await expect(page.locator('#treeSelect')).toHaveValue(name);
  await edit(page, 'startperson');
  page.once('dialog', d => d.accept('Kind Eins')); await page.locator('[data-create-relation="children"]').click();
  page.once('dialog', d => d.accept('Kind Zwei')); await page.locator('[data-create-relation="children"]').click();
  page.once('dialog', d => d.accept('Partner Eins')); await page.locator('[data-create-relation="partners"]').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await edit(page, 'partner_eins'); await page.locator('[data-add-relation="children"]').click();
  await page.locator('#pickerInput').fill('Kind Eins'); await page.locator('[data-pick="kind_eins"]').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await edit(page, 'kind_zwei'); await page.locator('#mergePersonBtn').click();
  page.once('dialog', d => d.accept()); await page.locator('[data-pick="kind_eins"]').click();
  await expect(page.locator('#personDialog')).toContainText('Kind Eins');
  await page.locator('#personDialog .dialog-close').click();
  let draft = await page.evaluate(tree => JSON.parse(localStorage.getItem(`familyTreeDraft:${tree}`)!), name);
  expect(draft.people.kind_zwei).toBeUndefined(); expect(draft.people.kind_eins.parents).toEqual(['startperson', 'partner_eins']);
  await edit(page, 'partner_eins'); page.once('dialog', d => d.accept()); await page.locator('#deletePersonBtn').click();
  draft = await page.evaluate(tree => JSON.parse(localStorage.getItem(`familyTreeDraft:${tree}`)!), name);
  expect(draft.people.partner_eins).toBeUndefined(); expect(draft.people.kind_eins.parents).toEqual(['startperson']);
  await page.goto('/?view=admin');
  for (const [button, extension] of [['#exportYaml', 'yaml'], ['#exportJson', 'json'], ['#exportGedcomBtn', 'ged']]) {
    const download = page.waitForEvent('download'); if (extension === 'ged') page.once('dialog', d => d.accept());
    await page.locator(button).click(); const file = await download;
    expect(file.suggestedFilename()).toBe(`${name}.${extension}`);
    const content = await fs.readFile((await file.path())!, 'utf8');
    expect(content).toContain('Startperson'); expect(content).not.toContain('Kind Zwei');
  }
  await save(page); await edit(page, 'kind_eins'); await page.locator('[name="occupation"]').fill('Verwerfen');
  await page.locator('#personEditor button[type="submit"]').click(); await page.goto('/?view=admin');
  page.once('dialog', d => d.accept()); await page.locator('#adminDiscard').click(); await expect(page.locator('#adminSync')).toBeDisabled();
  await edit(page, 'kind_eins'); await expect(page.locator('[name="occupation"]')).toHaveValue('');
});

test('a real concurrent save rejects a stale draft without losing its text', async ({ page }, testInfo) => {
  await login(page);
  const tree = `conflict_${testInfo.project.name}`, original = { meta: { focusPersonId: 'a' }, people: { a: { name: 'A' } } };
  expect((await page.request.post('/.netlify/functions/save-family', { data: { tree, create: true, data: original } })).status()).toBe(200);
  await page.evaluate(tree => localStorage.setItem('activeTree', tree), tree); await edit(page, 'a');
  await page.locator('[name="occupation"]').fill('Lokaler Text'); await page.locator('#personEditor button[type="submit"]').click();
  expect((await page.request.post('/.netlify/functions/save-family', { data: { tree, data: { ...original, people: { a: { name: 'A', notes: ['Neue zentrale Notiz'] } } } } })).status()).toBe(200);
  await page.goto('/?view=admin'); const response = page.waitForResponse(r => r.url().endsWith('/save-family'));
  let message = ''; page.once('dialog', d => { message = d.message(); return d.accept(); });
  await page.locator('#adminSync').click(); expect((await response).status()).toBe(409);
  await expect(page.locator('#adminSync')).toBeEnabled(); expect(message).toContain('changed');
  await edit(page, 'a'); await expect(page.locator('[name="occupation"]')).toHaveValue('Lokaler Text');
  const saved = YAML.parse(await (await page.request.get(`/data/trees/${tree}.yaml`)).text());
  expect(saved.people.a.notes).toEqual(['Neue zentrale Notiz']); expect(saved.people.a.occupation).toBeUndefined();
});

test('pending files return null when absent and read legacy Blob records alongside new byte records', async ({ page, isMobile }) => {
  await login(page);
  const result = await page.evaluate(async legacy => {
    const path = '/assets/pending.js', pending = await import(path);
    const absent = await pending.pendingGetFile('absent.txt');
    await pending.pendingPutFile('new.txt', new Blob(['new bytes'], { type: 'text/plain' }));
    let legacyText: string | null = null;
    if (legacy) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('stammgit-pending', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ blob: new Blob(['old blob']), type: 'text/plain' }, 'old.txt');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      });
      legacyText = await new Blob([(await pending.pendingGetFile('old.txt')).blob]).text();
    }
    const current = await pending.pendingGetFile('new.txt');
    return { absent, current: await new Blob([current.blob]).text(), type: current.type, legacyText };
  }, !isMobile);
  expect(result).toEqual({ absent: null, current: 'new bytes', type: 'text/plain', legacyText: isMobile ? null : 'old blob' });
});

test('ZIP download uses the existing endpoint and surfaces an unavailable backend', async ({ page }) => {
  await login(page); await page.goto('/?view=admin');
  // This checks the download UI separately; persistence tests above use real writes.
  const { default: JSZip } = await import('jszip'), zip = new JSZip();
  zip.file('synthetic.txt', 'fixture document'); const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  await page.route('**/.netlify/functions/download-sources', route => route.fulfill({ status: 200, contentType: 'application/zip', body: bytes }));
  const download = page.waitForEvent('download'); await page.locator('#downloadSourcesZip').click();
  const result = await JSZip.loadAsync(await fs.readFile((await (await download).path())!));
  expect(await result.file('synthetic.txt')!.async('string')).toBe('fixture document');
  await page.unroute('**/.netlify/functions/download-sources');
  let message = ''; page.once('dialog', d => { message = d.message(); return d.accept(); });
  await page.locator('#downloadSourcesZip').click();
  await expect.poll(() => message).toContain('ZIP-Download fehlgeschlagen');
  await expect(page.locator('#downloadSourcesZip')).toBeEnabled();
});

test('shared family connection geometry has a stable visual reference', async ({ page, isMobile }) => {
  await login(page);
  await page.evaluate(() => localStorage.setItem('activeTree', 'complex')); await page.reload();
  await expect(page.locator('[data-family-person]')).toHaveCount(11);
  // Fix just the geometry reference height; camera tests cover the responsive frame.
  await page.addStyleTag({ content: `.family-viewport { height: ${isMobile ? 284 : 384}px !important; min-height: 0 !important; }` });
  // Family fit uses height and centers Lea; all fixture connections remain in
  // the frame even though the wider card plane may extend beyond it on mobile.
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  const outside = await page.locator('.family-lines path').evaluateAll(paths => {
    const v = document.querySelector('.family-viewport')!, view = v.getBoundingClientRect();
    return paths.some(path => {
      const box = path.getBoundingClientRect();
      return box.left < view.left || box.right > view.left + v.clientWidth
        || box.top < view.top || box.bottom > view.top + v.clientHeight;
    });
  });
  expect(outside, 'Every fixture connection remains part of the visual check').toBe(false);
  // Compare geometry and line styles without platform-dependent font rasterization.
  // Card contents and interaction are asserted in family.spec.ts.
  await expect(page.locator('.family-viewport')).toHaveScreenshot('family-connections.png', {
    stylePath: 'tests/browser/geometry.css', scale: 'css', maxDiffPixels: 40,
  });
});
