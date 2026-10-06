import { openSource } from './source-support';
import { expect } from '@playwright/test';
import { test, login, openGraphPerson } from './support';
import type { Page } from '@playwright/test';
async function language(page: Page, code: string) {
  if (!await page.locator('.archive-menu').evaluate((menu: HTMLDetailsElement) => menu.open)) await page.locator('.archive-menu summary').click();
  await page.locator('[data-language-menu]').click();
  await page.locator(`[data-language="${code}"]`).click();
}
async function sources(page: Page) {
  await page.locator('.archive-menu summary').click();
  await page.locator('[data-view="sources"]').click();
}
test('published PDF language follows menu in persons, chapters, print and source list', async ({ page }) => {
  await page.route('**/data/source-files.json', route => route.fulfill({ json: ['/sources/test.pdf', '/sources/test.pt.pdf'] }));
  await login(page);
  await openGraphPerson(page, 'person_a');
  await page.locator('[data-info-sources]').click();
  await expect(page.locator('[data-info-sources] a')).toHaveAttribute('href', '/sources/test.pdf');
  await page.goto('/');
  await language(page, 'pt');
  await openGraphPerson(page, 'person_a');
  await page.locator('[data-info-sources]').click();
  await expect(page.locator('[data-info-sources] a')).toHaveAttribute('href', '/sources/test.pt.pdf');
  await page.goto('/?view=chronicle');
  await page.locator('[data-chapter="intro.pt.md"]').click();
  await expect(page.locator('a.chronicle-source')).toHaveAttribute('href', '/sources/test.pt.pdf');
  await expect(page.locator('.print-source-notes')).toContainText('/sources/test.pt.pdf');
  await sources(page);
  const doc = await openSource(page);
  await expect(doc).toHaveCount(1);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pt.pdf');
  await expect(doc.getByRole('link', { name: 'Original', exact: true })).toHaveAttribute('href', '/sources/test.pdf');
  await expect(doc.getByRole('link', { name: 'Português', exact: true })).toHaveAttribute('href', '/sources/test.pt.pdf');
  const mobile = page.viewportSize()!.width < 900;
  if (mobile) await page.locator('#sourceDialog .dialog-close').click();
  await language(page, 'de');
  if (mobile) await openSource(page);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pdf');
});
test('translation upload, reload and deletion update the fallback before sync', async ({ page }) => {
  // This case owns its source; cross-dataset retention is a separate safeguard.
  await page.route('**/data/source-links.json', route => route.fulfill({ json: { '/sources/test.pdf': { demo: 1 } } }));
  await login(page); await language(page, 'pt'); await sources(page);
  const doc = await openSource(page);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pdf');
  await doc.getByText('Gerenciar documento', { exact: true }).click();
  await doc.getByLabel('Enviar PDF traduzido · Português').setInputFiles({ name: 'qualquer-nome.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Portuguese test\n%%EOF') });
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', /^blob:/);
  await expect(doc.getByRole('link', { name: 'Original', exact: true })).toHaveAttribute('href', '/sources/test.pdf');
  await page.reload();
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', /^blob:/);
  page.on('dialog', dialog => dialog.accept());
  await doc.getByText('Gerenciar documento', { exact: true }).click();
  await doc.getByRole('button', { name: 'Excluir tradução · Português', exact: true }).click();
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pdf');
  await expect(doc.getByRole('link', { name: 'Português', exact: true })).toHaveCount(0);
});

test('original replacement keeps its filename, references and translations through reload and sync', async ({ page }) => {
  await page.route('**/data/source-files.json', route => route.fulfill({ json: ['/sources/test.pdf', '/sources/test.en.pdf', '/sources/test.pt.pdf'] }));
  await login(page); await sources(page);
  const doc = await openSource(page);
  await doc.getByText('Dokument verwalten', { exact: true }).click();
  const upload = doc.getByLabel('Deutsches PDF ersetzen', { exact: true });
  const file = { name: 'updated-document-with-another-name.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Updated German test\n%%EOF') };
  const before = await (await page.request.get('/sources/test.pdf')).body();
  page.once('dialog', dialog => dialog.dismiss());
  await upload.setInputFiles(file);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pdf');
  await expect(upload).toHaveValue('');

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Dateiname und Verlinkungen bleiben erhalten');
    await dialog.accept();
  });
  await upload.setInputFiles(file);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', /^blob:/);
  expect(await (await page.request.get('/sources/test.pdf')).body()).toEqual(before);
  await page.reload();
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', /^blob:/);
  await expect(doc.getByRole('link', { name: 'English', exact: true })).toHaveAttribute('href', '/sources/test.en.pdf');
  await expect(doc.getByRole('link', { name: 'Português', exact: true })).toHaveAttribute('href', '/sources/test.pt.pdf');
  await expect(doc.locator('[data-open-person="person_a"]')).toHaveCount(1);

  await page.goto('/?view=admin');
  const uploadRequest = page.waitForRequest(r => r.url().endsWith('/upload-source'));
  const saved = page.waitForResponse(r => r.url().endsWith('/save-family'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#adminSync').click();
  expect((await uploadRequest).postDataJSON()).toMatchObject({ filename: 'test.pdf', contentBase64: file.buffer.toString('base64') });
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().data.people.person_a.sources).toEqual([{ label: 'Testquelle', url: '/sources/test.pdf' }]);
  await expect(page.locator('#adminSync')).toBeDisabled();
  expect(await (await page.request.get('/sources/test.pdf')).body()).toEqual(file.buffer);
  await page.goto('/?view=sources');
  await openSource(page);
  await expect(doc.locator('a.button-link')).toHaveAttribute('href', '/sources/test.pdf');
  await expect(doc.locator('[data-open-person="person_a"]')).toHaveCount(1);
});

test('readers cannot replace source documents', async ({ page }) => {
  await login(page, 'fixture-reader'); await sources(page);
  await openSource(page);
  await expect(page.locator('#sourceDialog input[type="file"]')).toHaveCount(0);
});
