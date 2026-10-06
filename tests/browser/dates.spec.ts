import { expect } from '@playwright/test';
import { test, login } from './support';
for (const [language, born, full] of [['de', '* 1987', '5.9.1859'], ['pt', '* 1987', '5 de setembro de 1859'], ['en', '* 1987', '5 Sep 1859']]) {
  test(`consistent card, search and info dates in ${language}`, async ({ page }) => {
    await login(page, 'fixture-reader');
    await page.route('**/data/trees/demo.json', async route => {
      const data = await (await route.fetch()).json();
      data.people.person_a.birth = '1859-09-05'; data.people.person_a.death = '1945';
      data.people.person_b.birth = '1987-07-15'; delete data.people.person_b.death;
      await route.fulfill({ json: data });
    });
    await page.goto(`/?view=family&person=person_a&language=${language}`);
    await expect(page.locator('[data-family-person="person_a"] .person-years')).toHaveText(['* 1859', '† 1945']);
    const rows = await page.locator('[data-family-person="person_a"] .person-years').all();
    expect((await rows[1].boundingBox())!.y).toBeGreaterThan((await rows[0].boundingBox())!.y);
    await expect(page.locator('[data-family-person="person_b"] .person-years')).toHaveText(born);
    await page.locator('#family-search').fill('Bruno');
    await expect(page.getByRole('option')).toContainText(born);
    await page.locator('#family-search').press('Escape');
    await page.locator('[data-family-person="person_a"] .person-open').click();
    await expect(page.locator('.person-info-life p')).toHaveText([`* ${full}`, '† 1945']);
  });
}
