import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { test, login, selectGraphView } from './support';

async function selectTree(page: Page, tree: string) {
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await page.locator('#treeSelect').selectOption(tree);
  await expect(page.locator('#treeSelect')).toHaveValue(tree);
  await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
}
async function openComplex(page: Page) {
  await login(page);
  await selectTree(page, 'complex');
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'lea');
}
const card = (page: Page, id: string) => page.locator(`[data-family-person="${id}"]`);
const group = (page: Page, adults: string[]) => page.locator(`[data-family-group=${JSON.stringify(JSON.stringify([...adults].sort()))}]`);

async function expectMidpointStem(page: Page, adults: string[], child: string) {
  const family = group(page, adults);
  await expect(family.locator(`path[data-child="${child}"]`)).toHaveCount(1);
  await expect(family.locator(`path[data-child="${child}"]`)).toHaveAttribute('data-parents', JSON.stringify([...adults].sort()));
  const points = await family.evaluate((element, id) => {
    const bridge = element.querySelector('[data-family-connection]') as SVGPathElement;
    const stem = element.querySelector(`path[data-child="${id}"]`) as SVGPathElement;
    const mid = bridge.getPointAtLength(bridge.getTotalLength() / 2), origin = stem.getPointAtLength(0);
    return { mid: { x: mid.x, y: mid.y }, origin: { x: origin.x, y: origin.y } };
  }, child);
  expect(points.origin.x).toBeCloseTo(points.mid.x, 1);
  expect(points.origin.y).toBeCloseTo(points.mid.y, 1);
}

test('family defaults, distinct parent families, cards and complete person window', async ({ page }, testInfo) => {
  await openComplex(page);
  await expect(page.locator('[data-family-person]')).toHaveCount(11);
  await expect(card(page, 'separate')).toHaveCount(0);
  await expect(card(page, 'lea').locator('img')).toBeVisible();
  await expect(card(page, 'lea')).toContainText('geb. 1980');
  await expect(card(page, 'lea')).toContainText('Eine kurze vorhandene Berufsangabe');
  await expect(card(page, 'lea')).not.toContainText('Diese lange Notiz');
  await expect(group(page, ['lea', 'old']).locator('path[data-child="child_old"]')).toHaveCount(1);
  await expect(group(page, ['lea', 'old']).locator('[data-child="child_next"]')).toHaveCount(0);
  await expect(group(page, ['lea', 'next']).locator('path[data-child="child_next"]')).toHaveCount(1);
  await expect(group(page, ['lea']).locator('[data-child="child_solo"]')).toHaveCount(1);
  await expect(group(page, ['p1', 'p2']).locator('[data-partnership]')).toHaveCount(0);
  await expect(group(page, ['p1', 'p3']).locator('path[data-child="half"]')).toHaveCount(1);
  await expect(group(page, ['lea', 'old']).locator('[data-partnership].relation-ended')).toHaveCount(1);
  await expect(group(page, ['lea', 'next']).locator('[data-partnership].relation-unmarried')).toHaveCount(1);
  await expect(group(page, ['lea', 'old']).locator('[data-partnership]')).toHaveCSS('stroke-dasharray', '7px, 4px');
  await expect(group(page, ['lea', 'next']).locator('[data-partnership]')).toHaveCSS('stroke-dasharray', '7px, 4px');
  await expect(page.locator('.family-view details.graph-info')).toHaveCount(1);
  await expect(page.getByText('Linien', { exact: true })).toHaveCount(0);
  await expectMidpointStem(page, ['lea', 'old'], 'child_old');
  await expectMidpointStem(page, ['lea', 'next'], 'child_next');
  await expectMidpointStem(page, ['p1', 'p2'], 'lea');
  await expectMidpointStem(page, ['p1', 'p2'], 'sibling');
  await expectMidpointStem(page, ['p1', 'p3'], 'half');
  const normal = group(page, ['lea']).locator('path[data-child="child_solo"]');
  const biological = group(page, ['p1', 'p2']).locator('path[data-child="lea"]');
  const appearance = (el: Element) => [getComputedStyle(el).stroke, getComputedStyle(el).strokeDasharray];
  expect(await normal.evaluate(appearance)).toEqual(await biological.evaluate(appearance));
  await expect(biological).toHaveCSS('stroke-dasharray', 'none');
  await expect(page.locator('.family-group-children, .family-siblings')).toHaveCount(0);
  await expect(page.getByText(/Typ unbekannt|Partnerschaft erfasst/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.family-viewport').screenshot({ path: testInfo.outputPath('family-view.png') });

  await card(page, 'lea').getByRole('button', { name: 'Personeninfo: Lea Beispiel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lea Beispiel' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.person-actions > *')).toHaveCount(3);
  await expect(dialog.getByRole('link', { name: 'Im Baum', exact: true })).toHaveAttribute('href', /view=family&person=lea&action=family$/);
  await expect(dialog.locator('.person-actions').getByRole('link', { name: 'Bearbeiten', exact: true })).toHaveAttribute('href', /person=lea&action=edit$/);
  await expect(dialog.getByRole('button', { name: 'Zum Zentrum machen', exact: true })).toHaveCount(0);
  await expect(dialog.locator('a[href*="action=tree"], a[href*="action=descendants"]')).toHaveCount(0);
  await expect(dialog).toContainText('um 1980');
  await expect(dialog).toContainText('Diese lange Notiz bleibt ausschliesslich');
  await expect(dialog).toContainText('Beispielort');
  await expect(dialog.locator('.person-family-chips')).toContainText('Geschwister');
  await dialog.locator('[data-info-sources] summary').click();
  await expect(dialog.getByRole('link', { name: 'Testquelle' })).toHaveAttribute('href', '/sources/test.pdf');
  await dialog.getByRole('button', { name: 'Elternteil Eins', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Elternteil Eins' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Schliessen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('individual adoption and unspecified parent links share one child card without implying another adopter', async ({ page }, testInfo) => {
  await login(page);
  await selectTree(page, 'adoption');
  await expect(page.locator('[data-family-person]')).toHaveCount(5);
  await expect(card(page, 'child')).toHaveCount(1);
  await expect(group(page, ['c']).locator('path[data-child="child"]')).toHaveClass('relation-adoptive');
  await expect(group(page, ['d']).locator('path[data-child="child"]')).toHaveClass('relation-default');
  await expect(group(page, ['c', 'd']).locator('[data-child]')).toHaveCount(0);
  await expect(group(page, ['c', 'd']).locator('[data-partnership].relation-default')).toHaveCount(1);
  await expect(group(page, ['c', 'd']).locator('[data-partnership]')).toHaveCSS('stroke-dasharray', 'none');
  await expect(group(page, ['c']).locator('path[data-child="child"]')).toHaveCSS('stroke-dasharray', '7px, 4px');
  await expectMidpointStem(page, ['a', 'b'], 'child');
  await expect(page.locator('path[data-child="child"]')).toHaveCount(3);
  const appearance = (el: Element) => [getComputedStyle(el).stroke, getComputedStyle(el).strokeDasharray];
  const adopted = await group(page, ['c']).locator('[data-child]').evaluate(appearance);
  const ordinary = await group(page, ['d']).locator('[data-child]').evaluate(appearance);
  expect(adopted[0]).not.toBe(ordinary[0]);
  expect(adopted[1]).not.toBe(ordinary[1]);
  await page.locator('.family-viewport').screenshot({ path: testInfo.outputPath('adoption-view.png') });
  await card(page, 'child').getByRole('button', { name: 'Personeninfo: Kind Beispiel', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Adoption');
  await expect(dialog).not.toContainText(/unbekannt/i);
  await dialog.locator('[data-info-sources] summary').click();
  await expect(dialog.getByRole('link', { name: /Beleg zur Adoption/ })).toHaveAttribute('href', '/sources/test.pdf');
  await expect(dialog.locator('[data-info-person="d"]')).toHaveText('Elternteil D');
});

test('parent type edits preserve existing groups and sources through editor refreshes, exports and local persistence', async ({ page, browser, baseURL, isMobile, hasTouch, viewport, deviceScaleFactor, userAgent }, testInfo) => {
  await login(page);
  const tree = `relationships_${testInfo.project.name}`;
  const fixture = YAML.parse(await fs.readFile('tests/fixtures/archive/data/trees/adoption.yaml', 'utf8'));
  fixture.people.child.parentGroups = [['a', 'b'], ['c', 'd']];
  const created = await page.request.post('/.netlify/functions/save-family', { data: { tree, create: true, baseHash: null, data: fixture } });
  expect(created.status(), await created.text()).toBe(200);
  await page.reload();
  await selectTree(page, tree);
  await card(page, 'child').getByRole('button', { name: 'Personeninfo: Kind Beispiel', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('[data-parent-group]')).toHaveCount(0);
  await expect(page.getByText('Elternfamilie', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-parent-type="a"]')).toHaveValue('biological');
  await expect(page.locator('[data-parent-type="c"]')).toHaveValue('adoptive');
  await expect(page.locator('[data-parent-type="d"]')).toHaveValue('biological');
  await expect(page.locator('[data-parent-type="d"] option')).toHaveText(['Leiblich', 'Adoptiert']);
  await page.locator('#personEditor [name="occupation"]').fill('Erhaltener Formularentwurf');
  await page.locator('#personEditor [name="notes"]').fill('Notiz vor dem Hinzufügen einer Quelle');
  await page.locator('#srcUrlLabel').fill('Zusätzlicher Beleg');
  await page.locator('#srcUrl').fill('https://example.invalid/beleg');
  await page.locator('#srcAddUrl').click();
  await expect(page.locator('#personEditor [name="occupation"]')).toHaveValue('Erhaltener Formularentwurf');
  await expect(page.locator('#personEditor [name="notes"]')).toHaveValue('Notiz vor dem Hinzufügen einer Quelle');
  page.once('dialog', dialog => dialog.accept('Zusätzliches Testkind'));
  await page.locator('[data-create-relation="children"]').click();
  await expect(page.locator('#personEditor [name="occupation"]')).toHaveValue('Erhaltener Formularentwurf');
  await expect(page.locator('#personEditor [name="notes"]')).toHaveValue('Notiz vor dem Hinzufügen einer Quelle');
  await expect(page.locator('#mergePersonBtn')).toBeDisabled();
  await page.locator('[data-parent-type="b"]').selectOption('adoptive');
  await page.locator('[data-parent-type="c"]').selectOption('biological');
  await page.locator('[data-parent-type="c"]').selectOption('adoptive');
  await expect(page.locator('#personEditor [name="occupation"]')).toHaveValue('Erhaltener Formularentwurf');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
  await expect(group(page, ['c', 'd']).locator('path[data-child]')).toHaveCount(1);
  await expect(group(page, ['c', 'd']).locator('path[data-child]')).toHaveClass('relation-default');
  await expect(page.locator('[data-relationship-note="child"][data-parent="b"]')).toContainText('Adoption: Elternteil B');
  await expect(page.locator('[data-relationship-note="child"][data-parent="c"]')).toContainText('Adoption: Elternteil C');
  await expect(page.locator('[data-relationship-note="child"][data-parent="d"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  for (const button of ['#exportYaml', '#exportJson']) {
    const downloaded = page.waitForEvent('download');
    await page.locator(button).click();
    const text = await fs.readFile((await (await downloaded).path())!, 'utf8');
    const exported = button === '#exportYaml' ? YAML.parse(text) : JSON.parse(text);
    expect(exported.people.child.parentGroups).toEqual([['a', 'b'], ['c', 'd']]);
    expect(exported.people.child.parentDetails.b).toEqual({ type: 'adoptive' });
    expect(exported.people.child.parentDetails.c).toEqual(fixture.people.child.parentDetails.c);
    expect(exported.people.child.parentDetails.d).toBeUndefined();
  }
  const saved = page.waitForResponse(response => response.url().endsWith('/save-family'));
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    const message = dialog.message(); await dialog.accept(); return message;
  });
  await page.locator('#adminSync').click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({ mode: 'local', branch: 'fixture-save', commit: expect.stringMatching(/^[0-9a-f]{7,40}$/) });
  await expect(page.locator('#adminSync')).toBeDisabled();
  const savedMessage = await confirmation;
  expect(savedMessage).toContain('Lokal gespeichert in fixture-save');
  expect(savedMessage).not.toContain('Netlify baut');
  const serialized = YAML.parse(await (await page.request.get(`/data/trees/${tree}.yaml`)).text());
  expect(serialized.people.child.parentDetails.b.type).toBe('adoptive');
  expect(serialized.people.child.parentDetails.c.type).toBe('adoptive');
  expect(serialized.people.child.parentDetails.d).toBeUndefined();
  expect(serialized.people.child.occupation).toBe('Erhaltener Formularentwurf');
  expect(serialized.people.child.notes).toEqual(['Notiz vor dem Hinzufügen einer Quelle']);
  expect(serialized.people.child.sources).toContainEqual({ label: 'Zusätzlicher Beleg', url: 'https://example.invalid/beleg' });
  expect(serialized.people.child.children).toContain('zusatzliches_testkind');
  expect(serialized.people.zusatzliches_testkind.parents).toEqual(['child']);
  expect(serialized.people.child.parentDetails.c.sources).toEqual(fixture.people.child.parentDetails.c.sources);
  expect(serialized.people.child.parentGroups).toEqual([['a', 'b'], ['c', 'd']]);

  const fresh = await browser.newContext({ baseURL, isMobile, hasTouch, viewport, deviceScaleFactor, userAgent });
  await fresh.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  const reloaded = await fresh.newPage(), errors: string[] = [];
  reloaded.on('pageerror', error => errors.push(error.message));
  try {
    await login(reloaded);
    await selectTree(reloaded, tree);
    await expect(reloaded.locator('.draft-notice')).toHaveCount(0);
    await expect(card(reloaded, 'child')).toContainText('Erhaltener Formularentwurf');
    await expect(card(reloaded, 'zusatzliches_testkind')).toContainText('Zusätzliches Testkind');
    await expect(group(reloaded, ['c', 'd']).locator('path[data-child]')).toHaveCount(1);
    await expect(group(reloaded, ['c', 'd']).locator('path[data-child]')).toHaveClass('relation-default');
    await expect(reloaded.locator('[data-relationship-note="child"][data-parent="b"]')).toContainText('Adoption: Elternteil B');
    await expect(reloaded.locator('[data-relationship-note="child"][data-parent="c"]')).toContainText('Adoption: Elternteil C');
    await expect(reloaded.locator('[data-relationship-note="child"][data-parent="d"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await fresh.close(); }
});

test('changing a partnership status changes its visible line without duplicating either partner', async ({ page }) => {
  await openComplex(page);
  const bridge = () => group(page, ['lea', 'next']).locator('[data-partnership]');
  await expect(bridge()).toHaveCSS('stroke-dasharray', '7px, 4px');
  for (const [status, dash] of [['verheiratet', 'none'], ['partner', '7px, 4px'], ['geschieden', '7px, 4px']]) {
    await card(page, 'lea').getByRole('button', { name: 'Personeninfo: Lea Beispiel', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Bearbeiten', exact: true }).click();
    await expect(page.locator('[data-partner-field="kind"]')).toHaveCount(0);
    await page.locator('[data-partner-status="next"]').selectOption(status);
    await page.locator('#personEditor button[type="submit"]').click();
    await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
    await expect(bridge()).toHaveCSS('stroke-dasharray', dash);
    await expect(card(page, 'lea')).toHaveCount(1);
    await expect(card(page, 'next')).toHaveCount(1);
    await expectMidpointStem(page, ['lea', 'next'], 'child_next');
  }
});

test('existing care relationships survive opening and saving the simplified parent editor', async ({ page }) => {
  await login(page);
  const fixture = YAML.parse(await fs.readFile('tests/fixtures/archive/data/trees/adoption.yaml', 'utf8'));
  fixture.people.child.parentDetails.c.type = 'guardian';
  await page.evaluate(data => {
    localStorage.setItem('familyTreeDraft:adoption', JSON.stringify(data));
    localStorage.setItem('activeTree', 'adoption');
  }, fixture);
  await page.goto('/legacy.html?person=child&action=edit');
  await expect(page.locator('[data-parent-type="c"]')).toHaveValue('guardian');
  await page.locator('#personEditor [name="occupation"]').fill('Sorgebeziehung bleibt erhalten');
  await page.locator('#personEditor button[type="submit"]').click();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:adoption')!));
  expect(draft.people.child.parentDetails).toEqual(fixture.people.child.parentDetails);
  expect(draft.people.child.parentGroups).toEqual(fixture.people.child.parentGroups);
});

test('simplified partnership editor preserves recorded kind and dates through real save and reload', async ({ page }, testInfo) => {
  await login(page);
  const tree = `partner_fields_${testInfo.project.name}`;
  const fixture = YAML.parse(await fs.readFile('tests/fixtures/archive/data/trees/adoption.yaml', 'utf8'));
  const created = await page.request.post('/.netlify/functions/save-family', { data: { tree, create: true, baseHash: null, data: fixture } });
  expect(created.status(), await created.text()).toBe(200);
  await page.reload(); await selectTree(page, tree);
  await page.goto('/?person=c&action=edit');
  await expect(page.locator('#editDialog')).toBeVisible();
  await expect(page.locator('[data-partner-field="kind"]')).toHaveCount(0);
  await expect(page.getByText('Art der Partnerschaft', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-partner-status="d"]')).toHaveValue('');
  await expect(page.locator('[data-partner-field="start"][data-partner="d"]')).toHaveValue('1950');
  await expect(page.locator('[data-partner-field="end"][data-partner="d"]')).toHaveValue('');
  await page.locator('#personEditor [name="occupation"]').fill('Bearbeitet ohne Umdeutung der Partnerschaft');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?view=admin');
  const response = page.waitForResponse(r => r.url().endsWith('/save-family'));
  const confirmation = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await page.locator('#adminSync').click();
  const saved = await response;
  expect(saved.status(), await saved.text()).toBe(200);
  expect(await saved.json()).toMatchObject({ mode: 'local', branch: 'fixture-save' });
  await confirmation;
  const persisted = YAML.parse(await (await page.request.get(`/data/trees/${tree}.yaml`)).text());
  expect(persisted.people.c.partnerDetails).toEqual(fixture.people.c.partnerDetails);
  expect(persisted.people.d.partnerDetails).toBeUndefined();
  expect(persisted.people.c.occupation).toBe('Bearbeitet ohne Umdeutung der Partnerschaft');
  await page.evaluate(id => { localStorage.clear(); localStorage.setItem('activeTree', id); }, tree);
  await page.goto('/?person=c&action=edit');
  await expect(page.locator('#personEditor [name="occupation"]')).toHaveValue('Bearbeitet ohne Umdeutung der Partnerschaft');
  await expect(page.locator('[data-partner-status="d"]')).toHaveValue('');
  await expect(page.locator('[data-partner-field="start"][data-partner="d"]')).toHaveValue('1950');
  await expect(page.locator('[data-partner-field="kind"]')).toHaveCount(0);
});

test('standard GEDCOM import identifies the single adopter beside one neutral shared child stem', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  const content = `0 HEAD\n0 @I1@ INDI\n1 NAME Importkind\n1 ADOP\n2 FAMC @F1@\n3 ADOP HUSB\n0 @I2@ INDI\n1 NAME Adoptierende Person\n0 @I3@ INDI\n1 NAME Weitere Person\n0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 MARR\n1 CHIL @I1@\n0 TRLR\n`;
  await page.locator('#gedImportFile').setInputFiles({ name: 'adoption.ged', mimeType: 'text/plain', buffer: Buffer.from(content) });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#gedImportBtn').click();
  await expect(page.locator('#gedImportStatus')).toContainText('3');
  await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
  await page.getByLabel('Zentrumperson suchen und auswählen').fill('Importkind');
  await page.locator('#family-search-results').getByRole('button', { name: 'Importkind', exact: true }).click();
  await expect(card(page, 'importkind')).toHaveCount(1);
  await expect(page.locator('path[data-child="importkind"]')).toHaveCount(1);
  await expect(page.locator('path[data-child="importkind"]')).toHaveClass('relation-default');
  const note = page.locator('[data-relationship-note="importkind"][data-parent="adoptierende_person"]');
  await expect(note).toContainText('Adoption: Adoptierende Person');
  await expect(note.locator('path')).toHaveClass('relation-adoptive');
  await expect(page.locator('[data-relationship-note="importkind"][data-parent="weitere_person"]')).toHaveCount(0);
  await expectMidpointStem(page, ['adoptierende_person', 'weitere_person'], 'importkind');
  await expect(page.getByText(/Typ unbekannt/)).toHaveCount(0);
});

test('search and separate card actions change the center and keep the identity unique', async ({ page }) => {
  await openComplex(page);
  await card(page, 'child_old').locator('.person-focus').click();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'child_old');
  await expect(card(page, 'child_old')).toHaveCount(1);
  await page.getByLabel('Zentrumperson suchen und auswählen').fill('Einzelperson');
  await page.locator('#family-search-results').getByRole('button', { name: 'Einzelperson' }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await expect(page.locator('[data-partnership], path[data-child]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'separate');
});

test('person actions reach the existing editor, preserve a draft and return to the chosen center', async ({ page }) => {
  await openComplex(page);
  await card(page, 'old').locator('.person-focus').click();
  await card(page, 'old').getByRole('button', { name: 'Personeninfo: Alex Beispiel', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('#editDialog')).toBeVisible();
  await page.locator('#personEditor [name="occupation"]').fill('Entwurf aus dem Personenfenster');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'old');
  await expect(card(page, 'old')).toContainText('Entwurf aus dem Personenfenster');
  await card(page, 'old').getByRole('button', { name: 'Personeninfo: Alex Beispiel', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.person-actions > *')).toHaveCount(3);
  await page.locator('#personDialog .dialog-close').click();
  await selectGraphView(page, 'hourglass');
  await expect(page.locator('[data-family-person="old"]')).toBeVisible();
  await expect(page.locator('#svelte-app')).toBeVisible();
  await expect(page.locator('script[src*="/assets/app.js"]')).toHaveCount(0);
});

test('chronicle mentions in the native person window reach their existing chapter', async ({ page }) => {
  await login(page);
  await card(page, 'person_a').getByRole('button', { name: 'Personeninfo: Test Anna', exact: true }).click();
  await page.locator('#personDialog [data-info-chapters] summary').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Testgeschichte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Testgeschichte', exact: true })).toBeVisible();
  await expect(page.locator('article [data-person="person_a"]')).toBeVisible();
});
