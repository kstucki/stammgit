import { expect } from '@playwright/test';
import { test, login } from './support';

test('shortest kinship explanation updates on selection and leaves all graph routes intact', async ({ page }) => {
  await login(page, 'fixture-reader');
  const people: Record<string, { name: string; gender?: string; parents?: string[]; children?: string[]; partners?: string[] }> = {
    a: { name: 'Anna', parents: ['mother'] }, mother: { name: 'Maria', gender: 'f', parents: ['m2'] },
    m2: { name: 'M2', parents: ['m3'] }, m3: { name: 'M3', parents: ['m4'] }, m4: { name: 'M4', parents: ['g', 'h'] },
    b: { name: 'Bert', gender: 'm', parents: ['b2'] }, b2: { name: 'B2', parents: ['b3'] }, b3: { name: 'B3', parents: ['b4'] }, b4: { name: 'B4', parents: ['g', 'h'] },
    g: { name: 'Georg', partners: ['h'] }, h: { name: 'Gertrud', partners: ['g'] }, alone: { name: 'Solo' },
  };
  for (const [id, person] of Object.entries(people)) for (const parent of person.parents || []) (people[parent].children ||= []).push(id);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'a' }, people } }));
  await page.goto('/?view=family&action=connections&connect=a&connect=b');
  await expect(page.locator('ul.connection-descriptions > li[data-connection-description]')).toHaveCount(1);
  await expect(page.locator('ul.connection-descriptions > li[data-connection-description]')).toHaveText('Bert ist Cousin 3. Grades von Maria, der Mutter von Anna.');
  await expect(page.locator('[data-family-person]')).toHaveCount(11);
  await expect(page.locator('[data-child]')).toHaveCount(9);
  await page.locator('#connection-search').fill('Solo');
  await page.locator('[data-search-person="alone"]').click();
  await expect(page.locator('ul.connection-descriptions > li[data-connection-description]')).toHaveCount(2);
  await expect(page.locator('.graph-description')).toContainText('Zwischen Anna und Solo ist keine Verbindung dokumentiert.');
  await page.locator('[data-connection-selected="alone"]').click();
  await page.locator('[data-connection-selected="b"]').click();
  await expect(page.locator('ul.connection-descriptions > li[data-connection-description]')).toHaveCount(0);
  await expect(page.locator('.graph-description')).not.toContainText('Cousin');
  const original = await page.locator('.graph-description').innerText();
  expect(original.trim()).not.toBe('');
  await page.locator('[data-connection-selected="a"]').click();
  await expect(page.locator('.graph-description')).toHaveText(original);
});
