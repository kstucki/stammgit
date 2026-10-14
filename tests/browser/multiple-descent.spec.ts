import { expect } from '@playwright/test';
import { test, login } from './support';

const fixture = { meta: { focusPersonId: 'a' }, people: {
  a: { name: 'Anna', gender: 'f', parents: ['p', 'q'] },
  p: { name: 'Paul', gender: 'm', parents: ['x'], children: ['a'] },
  q: { name: 'Quirin', gender: 'm', parents: ['y'], children: ['a'], parentDetails: { y: { type: 'adoptive' } } },
  y: { name: 'Yvonne', gender: 'f', parents: ['x'], children: ['q'] },
  x: { name: 'Xaver', gender: 'm', children: ['p', 'y'] },
} };

for (const [language, relation] of [
  ['de', 'Grossvater von Anna (auch Urgrossvater; 2 Abstammungswege; davon 1 mit Adoption)'],
  ['en', 'grandfather of Anna (also great-grandfather; 2 lines of descent; 1 including adoption)'],
  ['pt', 'avô de Anna (também bisavô; 2 linhas de descendência; 1 com adoção)'],
]) test(`multiple descent stays consistent in the connection panel and person info: ${language}`, async ({ page }, testInfo) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
  await page.goto(`/?view=family&person=a&action=connections&connect=a&connect=x&language=${language}`);
  await expect(page.locator('#connectionPanel')).toContainText(relation);
  await expect(page.locator('[data-family-person]')).toHaveCount(5);
  await page.locator('[data-family-person="x"] .person-open').click();
  await expect(page.locator('[data-person-kinship]')).toHaveText(relation);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const fits = await page.locator('[data-person-kinship]').evaluate(el => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  if (language === 'de') await page.screenshot({ path: testInfo.outputPath('multiple-descent-after.png'), fullPage: true });
});
