import { expect } from '@playwright/test';
import { test, login } from './support';
for (const language of ['de', 'en']) test(`life details retain full dates and places in ${language}`, async ({ page }, info) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/config.json', async route => {
    const config = await (await route.fetch()).json(); config.language = language;
    await route.fulfill({ json: config });
  });
  const place = 'Berlin, a long historical district name without automatic abbreviation';
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    Object.assign(data.people.person_a, { birth: '1970-04-12', death: '2020', birthPlace: place, deathPlace: 'London', occupation: 'Teacher' });
    await route.fulfill({ json: data });
  });
  await page.goto('/?view=family&person=person_a&action=family');
  const card = page.locator('[data-family-person="person_a"]');
  await expect(card.locator('.person-years')).toHaveText(['* 1970', '† 2020']);
  await expect(card).not.toContainText(place);
  await expect(card).not.toContainText('Teacher');
  await card.locator('.person-open').click();
  await expect(page.locator('.person-info-life p')).toHaveText([
    `* ${language === 'de' ? '12.4.1970' : '12 Apr 1970'} in ${place}`, '† 2020 in London',
  ]);
  await expect(page.locator('.person-info-occupation')).toHaveText('Teacher');
  const overflow = await page.locator('.person-info-heading').evaluate(el => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath(`person-life-${language}.png`) });
});
test('editor saves and clears places without losing other fields', async ({ page }) => {
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  await page.locator('[name="birthPlace"]').fill('Berlin');
  await page.locator('[name="deathPlace"]').fill('London');
  await page.locator('[name="occupation"]').fill('Teacher');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=edit');
  await expect(page.locator('[name="birthPlace"]')).toHaveValue('Berlin');
  await expect(page.locator('[name="deathPlace"]')).toHaveValue('London');
  await expect(page.locator('[name="occupation"]')).toHaveValue('Teacher');
  await page.locator('[name="deathPlace"]').fill('');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=person');
  await expect(page.locator('.person-info-life')).toContainText('Berlin');
  await expect(page.locator('.person-info-life')).not.toContainText('London');
});
