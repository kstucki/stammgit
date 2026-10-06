import { expect } from '@playwright/test';
import { test, login } from './support';

test('personal websites survive edits and sync, stay outside sources, and can be removed', async ({ page, context }) => {
  await login(page);
  await page.goto('/?view=sources');
  await expect(page.locator('.source-doc').first()).toBeVisible();
  const sourceCount = await page.locator('.source-doc').count();
  await page.goto('/?person=person_a&action=edit');
  await page.locator('[name="notes"]').fill('Notiz vor dem Link.');
  await page.locator('#editor-section-tab-sources').click(); await page.locator('[name="webLinkLabel"]').fill('My website');
  await page.locator('[name="webLinkUrl"]').fill('https://example.org/about');
  await page.locator('[data-add-web-link]').click();
  await expect(page.locator('[data-web-links-editor] a')).toHaveText('My website');
  await page.locator('#personEditor button[type="submit"]').click();
  for (const [language, heading] of [['de', 'Weblinks'], ['en', 'Web links'], ['pt', 'Links']]) {
    await page.goto(`/?person=person_a&action=person&language=${language}`);
    await expect(page.locator('[data-info-links] h3')).toHaveText(heading);
    await expect(page.locator('[data-info-links] a')).toHaveAttribute('href', 'https://example.org/about');
    await expect(page.locator('[data-info-sources] a[href="https://example.org/about"]')).toHaveCount(0);
  }
  await page.goto('/?person=person_a&action=edit&language=de');
  await expect(page.locator('[name="notes"]')).toHaveValue('Notiz vor dem Link.');
  await page.locator('[name="occupation"]').fill('Testberuf');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?view=sources');
  await expect(page.locator('.source-doc')).toHaveCount(sourceCount);
  await page.goto('/?view=admin');
  page.once('dialog', dialog => dialog.accept());
  const saving = page.waitForResponse(r => r.url().endsWith('/save-family'));
  await page.locator('#adminSync').click();
  expect((await saving).status()).toBe(200);
  const saved = await (await page.request.get('/data/trees/demo.json')).json();
  expect(saved.people.person_a).toMatchObject({ occupation: 'Testberuf', notes: ['Notiz vor dem Link.'], links: [{ label: 'My website', url: 'https://example.org/about' }] });
  // A fresh reader session sees server data, rather than the admin's local draft.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem('familyTreeDraft:demo'));
  await login(page, 'fixture-reader');
  await page.goto('/?person=person_a&action=person');
  await expect(page.locator('[data-info-links] a')).toHaveText('My website');
  await expect(page.locator('[data-web-links-editor]')).toHaveCount(0);
  await context.clearCookies();
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  await page.locator('[name="notes"]').fill('Notiz beim Entfernen.');
  await page.locator('#editor-section-tab-sources').click(); await page.locator('[data-remove-web-link="0"]').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=person');
  await expect(page.locator('[data-info-links]')).toHaveCount(0);
  await expect(page.locator('.person-stories')).toContainText('Notiz beim Entfernen.');
});
