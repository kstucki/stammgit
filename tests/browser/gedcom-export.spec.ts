import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, login } from './support';

test('GEDCOM 5.5.1 and GEDCOM 7 exports offer languages and living-person protection', async ({ page }) => {
  await login(page);
  await page.goto('/?view=admin');
  await expect(page.locator('#gedLiving551')).toBeChecked();
  await expect(page.locator('#gedLiving7')).toBeChecked();
  await expect(page.locator('#gedLanguage option')).toHaveText(['Deutsch', 'English', 'Português']);

  await page.locator('#gedLiving551').uncheck();
  let download = page.waitForEvent('download'); page.once('dialog', d => d.accept());
  await page.locator('#exportGedcomBtn').click();
  const ged = await readFile((await (await download).path())!, 'utf8');
  expect(ged).toContain('2 VERS 5.5.1');
  expect(ged).toContain('1 NAME Lebende Person');
  expect(ged).not.toContain('Test Anna');

  await page.locator('#gedLanguage').selectOption('en');
  download = page.waitForEvent('download');
  await page.locator('#exportGedcom7Btn').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-gedcom7-en\.gdz$/);
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  const text = await zip.file('gedcom.ged')!.async('text');
  expect(text).toContain('2 VERS 7.0');
  expect(text).toContain('Test Anna');
  expect(text).toMatch(/1 FILE sources\/test\.pdf/);
  expect(zip.file('sources/test.pdf')).not.toBeNull();

  // The package imports additively; files already published are not staged again.
  await page.locator('#gedImportFile').setInputFiles((await file.path())!);
  page.once('dialog', d => d.accept());
  await page.locator('#gedImportBtn').click();
  await expect(page.locator('#gedImportStatus')).toContainText('4');
  await expect(page.locator('.draft-notice, #adminSync')).not.toHaveCount(0);
});

for (const code of ['de', 'en', 'pt']) test(`translated GEDZIP files, evidence IDs and catalogue labels survive import and sync in ${code}`, async ({ page }, info) => {
  const tree = `gedzip_${info.project.name}_${code}`;
  await login(page);
  const initial = { meta: { focusPersonId: 'root' }, people: { root: { name: 'Existing Root', living: false } } };
  const created = await page.request.post('/.netlify/functions/save-family', { data: { tree, create: true, data: initial } });
  expect(created.status(), await created.text()).toBe(200);
  await page.evaluate(tree => localStorage.setItem('activeTree', tree), tree);
  await page.goto(`/?view=admin&language=${code}`);
  const base = `gedzip-${info.project.name}-${code}`;
  const url = `/sources/${base}.pdf`, filename = `sources/${base}.en.pdf`;
  const { exportGedcom7 } = await import('../../public/assets/gedcom.js');
  const dataset = { meta: { focusPersonId: 'imported' }, people: { imported: { name: 'Imported Person', living: false, notes: ['Notiz'], notes_en: ['Imported note'], sources: [{ label: 'Test Document', url: `${url}#page=2` }] } },
    sourceCategories: { [url]: 'belege' }, sourceDetails: { [url]: { id: 'B900001', title: 'Test Document', tags: ['Must stay local'] } } };
  const { text } = exportGedcom7(dataset, { language: 'en', sourceFiles: new Set([`/${filename}`]) });
  const archive = new JSZip(); archive.file('gedcom.ged', text); archive.file(filename, '%PDF-1.4\nEnglish source bytes');
  await page.locator('#gedImportFile').setInputFiles({ name: 'import.gdz', mimeType: 'application/zip', buffer: await archive.generateAsync({ type: 'nodebuffer' }) });
  page.once('dialog', d => d.accept()); await page.locator('#gedImportBtn').click();
  await expect(page.locator('#gedImportStatus')).toContainText('1');
  await expect(page.locator('#gedImportBtn')).toBeEnabled();
  const draft = await page.evaluate(tree => JSON.parse(localStorage.getItem(`familyTreeDraft:${tree}`)!), tree);
  expect(draft.people.imported.sources[0].url).toBe(`${url}#page=2`);
  expect(draft.sourceDetails[url]).toEqual({ id: 'B900001', title: 'Test Document' });
  expect(draft.people.imported.notes).toEqual(['Imported note']);
  await page.reload();
  await expect(page.locator('#gedLanguage')).toHaveValue(code);
  await page.screenshot({ path: info.outputPath(`gedcom-admin-${code}.png`), fullPage: true });
  const saved = page.waitForResponse(r => r.url().endsWith('/save-family'));
  page.once('dialog', d => d.accept()); await page.locator('#adminSync').click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('#adminSync')).toBeDisabled();
  const pdf = await page.request.get(url);
  expect(pdf.status()).toBe(200); expect(await pdf.text()).toContain('English source bytes');
  const json = await (await page.request.get(`/data/trees/${tree}.json`)).json();
  expect(json.sourceDetails[url].id).toBe('B900001');
  expect(json.people.imported.sources[0].url).toBe(`${url}#page=2`);
});

test('missing and conflicting package files leave the current dataset and upload queue untouched', async ({ page }) => {
  await login(page); await page.goto('/?view=admin');
  const { exportGedcom7 } = await import('../../public/assets/gedcom.js');
  const text = exportGedcom7({ meta: { focusPersonId: 'a' }, people: { a: { name: 'New Person', living: false, sources: [{ label: 'Source', url: '/sources/test.pdf' }] } } }).text;
  const before = await page.evaluate(() => localStorage.getItem('familyTreeDraft:demo'));
  for (const included of [false, true]) {
    const zip = new JSZip(); zip.file('gedcom.ged', text);
    if (included) zip.file('sources/test.pdf', 'A different document');
    await page.locator('#gedImportFile').setInputFiles({ name: 'invalid.gdz', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    if (included) page.once('dialog', d => d.accept());
    await page.locator('#gedImportBtn').click();
    await expect(page.locator('#gedImportStatus')).toContainText(included ? 'anderem Inhalt' : 'fehlt');
    expect(await page.evaluate(() => localStorage.getItem('familyTreeDraft:demo'))).toBe(before);
    await expect(page.locator('#adminSync')).toBeDisabled();
  }
});
