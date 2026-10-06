import { expect } from '@playwright/test';
import { test, login } from './support';
import { openSource } from './source-support';

// Test the geometry of the shared control as well as clicks: inherited padding
// used to push the source sheet's cross out of its 40px button.
test('source, person and editor use the same centred close control', async ({ page }) => {
  await login(page);
  for (const kind of ['source', 'person', 'edit']) {
    if (kind === 'source') { await page.goto('/?view=sources'); await openSource(page); }
    else await page.goto(`/?person=person_a&action=${kind === 'edit' ? 'edit' : 'person'}`);
    const dialog = page.locator(`#${kind}Dialog`);
    const close = dialog.locator('.dialog-close');
    await expect(close).toBeVisible();
    const box = (await close.boundingBox())!, icon = (await close.locator('svg').boundingBox())!;
    expect(box.width).toBe(40); expect(box.height).toBe(40);
    expect(Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2)).toBeLessThan(1);
    expect(Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2)).toBeLessThan(1);
    await expect(close).toHaveCSS('border-radius', '50%');
    await expect(close).toHaveCSS('padding', '0px');
    await close.click(); await expect(dialog).toHaveCount(0);
  }
});

for (const [locale, person, description, more, save] of [
  ['de', 'Person', 'Beschreibung', 'Weitere Aktionen', 'Speichern'],
  ['en', 'Person', 'Description', 'More actions', 'Save'],
  ['pt', 'Pessoa', 'Descrição', 'Mais ações', 'Salvar'],
]) test(`compact editor fits, keeps actions visible and uses ${locale}`, async ({ page }, info) => {
  await login(page);
  await page.goto(`/?person=person_a&action=edit&language=${locale}`);
  await expect(page.locator('#editor-section-tab-person')).toHaveText(person);
  await expect(page.locator('#editor-description-title')).toHaveText(description);
  await expect(page.locator('.editor-more summary')).toHaveText(more);
  await expect(page.locator(`#editor-language-tab-${locale}`)).toHaveAttribute('aria-selected', 'true');
  const submit = page.locator('#personEditor button[type="submit"]');
  await expect(submit).toHaveText(save);
  await expect(page.locator('[name="displayName"]')).toBeHidden();
  for (const section of ['person', 'family', 'sources', 'photo']) {
    await page.locator(`#editor-section-tab-${section}`).click();
    await expect(page.locator(`#editor-section-panel-${section}`)).toBeVisible();
    await expect(submit).toBeInViewport({ ratio: 1 });
    const dialog = page.locator('#editDialog');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    expect(await page.locator('.editor-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${locale}-${section}.png`) });
  }
  await page.locator('#editor-section-tab-person').click();
  await page.locator('.editor-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(submit).toBeInViewport({ ratio: 1 });
  await page.locator('#editDialog .dialog-close').click();
  expect(await page.evaluate(() => localStorage.getItem('familyTreeDraft:demo'))).toBeNull();
});

test('keyboard tabs preserve three language drafts and an unfinished photo crop', async ({ page }) => {
  await login(page); await page.goto('/?person=person_a&action=edit');
  await page.locator('#editor-language-tab-de').click();
  await page.locator('[name="notes"]').fill('Deutsch geändert.');
  await page.locator('#editor-language-tab-de').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#editor-language-tab-en')).toBeFocused();
  await page.locator('[name="notes_en"]').fill('English changed.');
  await page.locator('#editor-language-tab-en').focus(); await page.keyboard.press('End');
  await page.locator('[name="notes_pt"]').fill('Português alterado.');
  await page.locator('#editor-section-tab-person').focus(); await page.keyboard.press('End');
  await expect(page.locator('#editor-section-tab-photo')).toBeFocused();
  await page.locator('#photoFile').setInputFiles('tests/fixtures/archive/public/photos/test.png');
  await expect(page.locator('#photoCanvas')).toBeVisible();
  await page.locator('#photoZoom').fill('1.5');
  await page.locator('#editor-section-tab-family').click();
  await page.locator('#editor-section-tab-photo').click();
  await expect(page.locator('#photoCanvas')).toBeVisible();
  await expect(page.locator('#photoZoom')).toHaveValue('1.5');
  await page.locator('#editor-section-tab-photo').focus(); await page.keyboard.press('Home');
  await expect(page.locator('#editor-section-tab-person')).toBeFocused();
  await expect(page.locator('[name="notes_pt"]')).toHaveValue('Português alterado.');
  await page.locator('#editor-language-tab-de').click();
  await expect(page.locator('[name="notes"]')).toHaveValue('Deutsch geändert.');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=edit');
  await expect(page.locator('[name="notes"]')).toHaveValue('Deutsch geändert.');
  await expect(page.locator('[name="notes_en"]')).toHaveValue('English changed.');
  await expect(page.locator('[name="notes_pt"]')).toHaveValue('Português alterado.');
});

test('validation brings a hidden invalid field back into view', async ({ page }) => {
  await login(page); await page.goto('/?person=person_a&action=edit');
  await page.locator('[name="name"]').fill('');
  await page.locator('#editor-section-tab-family').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await expect(page.locator('[name="name"]')).toBeFocused();
  await expect(page.locator('.editor-footer [role="alert"]')).not.toBeEmpty();
  await page.locator('[name="name"]').fill('Test Anna');
  await page.locator('#editor-section-tab-sources').click();
  await page.locator('#srcUrl').fill('invalid-url');
  await page.locator('#editor-section-tab-person').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await expect(page.locator('#srcUrl')).toBeFocused();
  await page.locator('#srcUrl').fill('');
  await page.locator('#personEditor button[type="submit"]').click();
  await expect(page.locator('#editDialog')).toHaveCount(0);
});
