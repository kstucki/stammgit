import { expect } from '@playwright/test';
import { test, login, selectGraphView } from './support';
test('display name reaches cards, fan and chronicle; full name stays in info and both are searchable', async ({ page }) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    Object.assign(data.people.person_a, { name: 'Anna Maria Beispiel', displayName: 'Anni Beispiel' });
    await route.fulfill({ json: data });
  });
  await page.route('**/chronicle/demo/intro.md', route => route.fulfill({ contentType: 'text/markdown', body: '---\ntitle: Testgeschichte\n---\n[[p:person_a]] und [[p:person_a|meine Mutter]].' }));
  await page.goto('/?view=family&person=person_a&action=family');
  await expect(page.locator('[data-family-person="person_a"] strong')).toHaveText('Anni Beispiel');
  for (const query of ['Maria', 'Anni']) {
    await page.locator('#family-search').fill(query);
    await expect(page.getByRole('option')).toContainText('Anna Maria Beispiel');
    await page.locator('#family-search').press('Escape');
  }
  await page.locator('[data-family-person="person_a"] .person-open').click();
  await expect(page.locator('#family-person-title')).toHaveText('Anna Maria Beispiel');
  await page.getByRole('button', { name: 'Schliessen', exact: true }).click();
  await selectGraphView(page, 'ancestors');
  await expect(page.locator('[data-fan-person="person_a"] .fan-label')).toContainText('Anni Beispiel');
  await expect(page.locator('[data-fan-person="person_a"]')).toHaveAttribute('aria-label', /Anna Maria Beispiel/);
  await page.goto('/?view=chronicle&chapter=intro.md');
  await expect(page.locator('[data-person="person_a"]')).toHaveText(['Anni Beispiel', 'meine Mutter']);
  await page.locator('[data-person="person_a"]').first().click();
  await expect(page.locator('#family-person-title')).toHaveText('Anna Maria Beispiel');
});
test('editor saves and clears display name without replacing the full name', async ({ page }) => {
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  const fullName = await page.locator('[name="name"]').inputValue();
  await page.locator('[name="displayName"]').fill('Anni Beispiel');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?view=family&person=person_a&action=family');
  await expect(page.locator('[data-family-person="person_a"] strong')).toHaveText('Anni Beispiel');
  await page.goto('/?person=person_a&action=edit');
  await expect(page.locator('[name="name"]')).toHaveValue(fullName);
  await expect(page.locator('[name="displayName"]')).toHaveValue('Anni Beispiel');
  await page.locator('[name="displayName"]').fill('');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?view=family&person=person_a&action=family');
  await expect(page.locator('[data-family-person="person_a"] strong')).toHaveText(fullName);
});
