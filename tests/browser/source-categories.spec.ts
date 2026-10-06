import { openSource, selectSourceCategory } from './source-support';
import { expect } from '@playwright/test';
import { test, login } from './support';

test.beforeEach(async ({ page }) => {
  // The general fixture shares this PDF with other trees. Deletion cases opt in
  // to that protection explicitly, so declining a deletion is tested separately.
  await page.route('**/data/source-links.json', route => route.fulfill({ json: { '/sources/test.pdf': { demo: 1 } } }));
});

test('new file upload retains the selected category', async ({ page }) => {
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  await expect(page.locator('#editDialog')).toBeVisible();
  await page.locator('#editor-section-tab-sources').click(); await page.locator('#srcCategory').selectOption('belege');
  await page.locator('#srcLabel').fill('Review Upload');
  await page.locator('#srcFile').setInputFiles({
    name: 'review-new.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% synthetic review file\n%%EOF'),
  });
  await page.locator('#srcUpload').click();
  await expect(page.locator('#editDialog a').filter({ hasText: 'Review Upload' })).toHaveAttribute('href', /^blob:/);
  const category = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!).sourceCategories?.['/sources/review-new.pdf']);
  expect(category, 'The chosen category must be stored with the new file').toBe('belege');
  await page.reload();
  await expect(page.locator('#editDialog a').filter({ hasText: 'Review Upload' })).toHaveAttribute('href', /^blob:/);
  await page.goto('/?view=sources');
  await selectSourceCategory(page, 'belege');
  await expect(page.locator('#source-category-belege .source-doc').filter({ hasText: 'Review Upload' })).toBeVisible();
});

for (const reason of ['declined deletion', 'other tree']) test(`keeping a file preserves its category: ${reason}`, async ({ page }) => {
  await page.route('**/data/trees/demo.json', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.sourceCategories = { '/sources/test.pdf': 'belege' };
    await route.fulfill({ json: data });
  });
  if (reason === 'other tree') await page.route('**/data/source-links.json', route => route.fulfill({
    json: { '/sources/test.pdf': { demo: 1, other: 1 } },
  }));
  await login(page);
  await page.goto('/?view=sources');
  await page.locator('#sourcesSearch').fill('test');
  await page.locator('#sourcesSearch').press('Escape');
  const doc = await openSource(page);
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  await expect(doc.locator('.source-category-switch select')).toHaveValue('belege');
  const messages: string[] = [];
  const types: string[] = [];
  page.on('dialog', async dialog => {
    messages.push(dialog.message());
    types.push(dialog.type());
    if (dialog.type() === 'alert' || messages.length === 1) await dialog.accept(); else await dialog.dismiss();
  });
  await doc.locator('[data-delete-source]').click();
  await expect(page.locator('.workspace[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  expect(messages).toHaveLength(2);
  expect(types).toEqual(['confirm', reason === 'other tree' ? 'alert' : 'confirm']);
  await expect(doc).toBeVisible();
  expect((await page.request.get('/sources/test.pdf')).status()).toBe(200);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  expect(draft.people.person_a.sources).toBeUndefined();
  expect(draft.sourceCategories?.['/sources/test.pdf'], 'Category belongs to the retained document').toBe('belege');
  await page.reload();
  await expect(page.locator('#sourceDialog [data-delete-source="/sources/test.pdf"]')).toHaveCount(1);
});

for (const url of ['/sources/test.pdf', 'https://example.invalid/archive']) test(`deleting the original clears its category: ${url}`, async ({ page }) => {
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    data.sourceCategories = { [url]: 'belege' };
    data.people.person_a.sources = [{ label: 'Categorized original', url }];
    await route.fulfill({ json: data });
  });
  await login(page);
  await page.goto('/?view=sources');
  const doc = await openSource(page, url);
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  page.on('dialog', dialog => dialog.accept());
  await doc.locator('[data-delete-source]').click();
  await expect(page.locator('.workspace[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  await expect(doc).toHaveCount(0);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  expect(draft.sourceCategories?.[url]).toBeUndefined();
  expect(draft.people.person_a.sources).toBeUndefined();
});

test('uploading and deleting a translation preserves the original category and links', async ({ page }) => {
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    data.sourceCategories = { '/sources/test.pdf': 'register' };
    await route.fulfill({ json: data });
  });
  await page.route('**/data/source-files.json', route => route.fulfill({ json: ['/sources/test.pdf'] }));
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  await page.locator('#editor-section-tab-sources').click(); await page.locator('#srcCategory').selectOption('belege');
  await page.locator('#srcLabel').fill('English translation');
  await page.locator('#srcFile').setInputFiles({ name: 'test.en.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Translation\n%%EOF') });
  await page.locator('#srcUpload').click();
  await expect(page.locator('#srcStatus')).toHaveText('Lokal gespeichert und verknüpft. Die Datei liegt bis zum «Synchronisieren» nur in diesem Browser.');
  await page.goto('/?view=sources');
  const doc = await openSource(page);
  await expect(doc.getByRole('link', { name: 'English', exact: true })).toHaveAttribute('href', /^blob:/);
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  page.on('dialog', dialog => dialog.accept());
  await doc.getByRole('button', { name: 'Übersetzung löschen · English', exact: true }).click();
  await expect(doc.getByRole('link', { name: 'English', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(doc).toBeVisible();
  await expect(doc.locator('[data-open-person="person_a"]')).toHaveCount(1);
});

test('category changes persist through reload and isolated local sync', async ({ page }) => {
  await login(page);
  await page.goto('/?view=sources');
  await page.locator('#sourcesSearch').press('Escape');
  const doc = await openSource(page);
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  await doc.locator('.source-category-switch select').selectOption('register');
  await page.reload();
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  await expect(doc.locator('.source-category-switch select')).toHaveValue('register');
  await page.goto('/?view=admin');
  page.once('dialog', dialog => dialog.accept());
  const response = page.waitForResponse(r => r.url().endsWith('/save-family'));
  await page.locator('#adminSync').click();
  const saved = await response;
  expect(saved.status(), await saved.text()).toBe(200);
  expect(await saved.json()).toMatchObject({ mode: 'local', branch: 'fixture-save' });
  await expect(page.locator('#adminSync')).toBeDisabled();
  const data = await (await page.request.get('/data/trees/demo.json')).json();
  expect(data.sourceCategories?.['/sources/test.pdf']).toBe('register');
});
