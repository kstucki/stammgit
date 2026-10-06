import { expect, type Page } from '@playwright/test';
import { test, login } from './support';

async function setup(page: Page, admin = false) {
  await login(page, admin ? 'fixture-admin' : 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: {
    meta: { focusPersonId: 'unassessed' }, people: {
      unassessed: { name: 'Unassessed Example' },
      uncertain: { name: 'Uncertain Example', evidenceStatus: 'unsicher' },
      good: { name: 'Good Example', evidenceStatus: 'gut' },
      confirmed: { name: 'Confirmed Example', evidenceStatus: 'gesichert' },
      notes_only: { name: 'Notes Example', notes: ['Belegstufe 2: Originale ungeprüft.'] },
    },
  } }));
  await page.evaluate(() => { localStorage.setItem('activeTree', 'demo'); sessionStorage.setItem('familyCenter:demo', 'unassessed'); });
}
async function show(page: Page, id: string) {
  await page.goto(`/?person=${id}&action=person`);
  await expect(page.locator('#personDialog')).toBeVisible();
}
test('only explicit uncertainty appears in person information, never on cards', async ({ page }) => {
  await setup(page);
  for (const id of ['unassessed', 'good', 'confirmed', 'notes_only']) {
    await show(page, id);
    await expect(page.locator('.person-evidence')).toHaveCount(0);
  }
  await show(page, 'uncertain');
  await expect(page.locator('#personDialog .person-evidence')).toHaveText('Belegstatus: unsicher');
  await expect(page.locator('[data-family-person] .person-evidence')).toHaveCount(0);
  await expect(page.locator('[data-edit-person]')).toHaveCount(0);
});
test('admin can set, preserve and clear evidence status in a draft', async ({ page }) => {
  await setup(page, true);
  for (const value of ['unsicher', 'gut', 'gesichert', '']) {
    await show(page, 'unassessed');
    await page.locator('[data-edit-person]').click();
    await page.locator('#editor-section-tab-sources').click();
    await page.locator('select[name="evidenceStatus"]').selectOption(value);
    await page.locator('#personEditor button[type="submit"]').click();
    await expect(page.locator('#editDialog')).toHaveCount(0);
    const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!).people.unassessed);
    if (value) expect(recorded.evidenceStatus).toBe(value);
    else expect(recorded).not.toHaveProperty('evidenceStatus');
    await show(page, 'unassessed');
    await expect(page.locator('.person-evidence')).toHaveCount(value === 'unsicher' ? 1 : 0);
    await page.locator('[data-edit-person]').click();
    await page.locator('#editor-section-tab-sources').click();
    await expect(page.locator('select[name="evidenceStatus"]')).toHaveValue(value);
    await page.locator('#editor-section-tab-person').click();
    await page.locator('input[name="occupation"]').fill('Example occupation');
    await page.locator('#personEditor button[type="submit"]').click();
    const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!).people.unassessed);
    expect(retained.evidenceStatus).toBe(value || undefined);
  }
});
