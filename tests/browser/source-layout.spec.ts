import { expect, type Page } from '@playwright/test';
import { test, login } from './support';
import { openSource, selectSourceCategory } from './source-support';

async function fixture(page: Page, many = false) {
  const docs = Array.from({ length: many ? 61 : 5 }, (_, i) => ({ label: `Dokument ${String(i + 1).padStart(2, '0')}`, url: `/sources/doc-${i + 1}.pdf` }));
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: {
    meta: { focusPersonId: 'a' },
    people: {
      a: { name: 'Anna Beispiel', living: true, sources: docs.slice(0, -1) },
      b: { name: 'Bruno Beispiel', living: true, sources: [docs[0]] },
      c: { name: 'Clara Beispiel', living: true, sources: [docs[0]] },
      d: { name: 'Dora mit einem sehr langen vollständigen Familiennamen', living: true, sources: [docs[0]] },
    },
    sourceDetails: Object.fromEntries(docs.map((doc, i) => [doc.url, { id: `B${String(i + 1).padStart(6, '0')}`, title: doc.label, citation: 'Archiv: Testbeleg', original: 'https://example.org/source', archive: 'Archivsuche (keine gesicherte Archivkopie): https://example.org/archive', tags: i < 2 ? ['Meyer', 'Müller'] : ['Meyer'] }])),
    sourceCategories: Object.fromEntries(docs.map((doc, i) => [doc.url, i < docs.length - 1 ? 'belege' : 'register'])),
  } }));
  await page.route('**/data/source-files.json', route => route.fulfill({ json: docs.map(d => d.url) }));
}

test('compact rows open a source sheet with a collapsed person list, and person search finds it', async ({ page }) => {
  await fixture(page); await login(page, 'fixture-reader'); await page.goto('/?view=sources');
  await expect(page.locator('.source-doc')).toHaveCount(5);
  await expect(page.locator('.source-doc [data-open-person]')).toHaveCount(0);
  await expect(page.locator('.source-doc').last()).toContainText('0 Personen');
  const detail = await openSource(page, '/sources/doc-1.pdf');
  await expect(detail.locator('.source-people summary')).toHaveText('4 Personen');
  await expect(detail.locator('[data-open-person]').first()).toBeHidden();
  await expect(detail.locator('.source-management')).toHaveCount(0);
  await detail.locator('.source-people summary').press('Enter');
  await expect(detail.locator('[data-open-person]:visible')).toHaveCount(4);
  await page.locator('#sourceDialog .dialog-close').click();
  await page.locator('#sourcesSearch').fill('Dora'); await page.locator('#sourcesSearch').press('Escape');
  await expect(page.locator('.source-doc')).toHaveCount(1);
  await openSource(page, '/sources/doc-1.pdf');
  await detail.locator('.source-people summary').click();
  await detail.locator('[data-open-person="d"]').click();
  await expect(page.locator('#personDialog')).toContainText('Dora mit einem sehr langen vollständigen Familiennamen');
  await expect(page.locator('#sourceDialog')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#sourcesSearch')).toHaveValue('Dora');
  await expect(detail).toBeVisible();
});

for (const [code, manage, evidence, allFamilies] of [
  ['de', 'Dokument verwalten', 'Belege', 'Alle Familien'],
  ['en', 'Manage document', 'Evidence', 'All families'],
  ['pt', 'Gerenciar documento', 'Evidências', 'Todas as famílias'],
]) test(`catalogue categories, filters and source details fit and use ${code}`, async ({ page }) => {
  await fixture(page); await login(page); await page.goto(`/?view=sources&language=${code}`);
  await selectSourceCategory(page, 'belege');
  await expect(page.locator('.source-category-title')).toHaveText(evidence);
  await expect(page.locator('#sourceFamily option').first()).toHaveText(allFamilies);
  await expect(page.locator('.source-doc')).toHaveCount(4);
  await expect(page.locator('.source-category-description')).not.toBeEmpty();
  const detail = await openSource(page, '/sources/doc-1.pdf');
  await expect(detail).toContainText('B000001');
  await expect(detail).toContainText('Archivsuche (keine gesicherte Archivkopie)');
  await expect(detail.getByRole('link', { name: 'https://example.org/source', exact: true })).toHaveAttribute('href', 'https://example.org/source');
  await expect(detail.locator('input[type="file"]').first()).toBeHidden();
  await detail.getByText(manage, { exact: true }).click();
  await expect(detail.locator('input[type="file"]:visible')).toHaveCount(3);
  await expect(detail.locator('[data-delete-source]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('pagination and intersecting family filters persist through reload and person navigation', async ({ page }) => {
  await fixture(page, true); await login(page); await page.goto('/?view=sources');
  await selectSourceCategory(page, 'belege');
  await expect(page.locator('.source-doc')).toHaveCount(25);
  await page.locator('[data-source-next]').click();
  await expect(page.locator('.source-doc').first()).toContainText('Dokument 26');
  await openSource(page, '/sources/doc-30.pdf');
  await page.reload();
  await expect(page.locator('.source-doc').first()).toContainText('Dokument 26');
  await expect(page.locator('#sourceDialog')).toContainText('Dokument 30');
  await page.locator('#sourceDialog [data-open-person="a"]').click();
  await page.goBack();
  await expect(page.locator('#sourceDialog')).toContainText('Dokument 30');
  await page.locator('#sourceDialog .dialog-close').click();
  await page.locator('#sourceFamily').selectOption('Müller');
  await expect(page.locator('.source-doc')).toHaveCount(2);
  await expect(page.locator('.source-pagination')).toHaveCount(0);
  await page.locator('#sourcesSearch').fill('b000002 Anna'); await page.locator('#sourcesSearch').press('Escape');
  await expect(page.locator('.source-doc')).toHaveCount(1);
  await expect(page.locator('.source-doc')).toContainText('Dokument 02');
  await page.reload();
  await expect(page.locator('#sourceFamily')).toHaveValue('Müller');
  await expect(page.locator('.source-doc')).toHaveCount(1);
  await page.locator('#sourcesSearch').fill('unfindbar'); await page.locator('#sourcesSearch').press('Escape');
  await expect(page.locator('.source-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await expect(page.locator('.source-doc')).toHaveCount(25);
});

test('family tags are editable metadata, survive local sync, and do not change source references', async ({ page }) => {
  await login(page);
  await page.goto('/?view=sources');
  const detail = await openSource(page);
  await detail.getByText('Dokument verwalten', { exact: true }).click();
  await detail.locator('.source-category-switch select').selectOption('belege');
  await detail.locator('[name="sourceTags"]').fill('Meyer, Müller, Meyer');
  await detail.locator('[data-save-source-tags]').click();
  await page.reload();
  await expect(detail.locator('.source-tag-list')).toContainText('Meyer · Müller');
  await page.goto('/?view=admin');
  page.once('dialog', dialog => dialog.accept());
  const saved = page.waitForResponse(r => r.url().endsWith('/save-family'));
  await page.locator('#adminSync').click(); expect((await saved).status()).toBe(200);
  const data = await (await page.request.get('/data/trees/demo.json')).json();
  expect(data.sourceDetails['/sources/test.pdf'].tags).toEqual(['Meyer', 'Müller']);
  expect(data.people.person_a.sources).toEqual([{ label: 'Testquelle', url: '/sources/test.pdf' }]);
});
