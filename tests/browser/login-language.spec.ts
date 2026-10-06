import { expect } from '@playwright/test';
import { test } from './support';
for (const [languages, expected] of [
  [['pt-BR'], 'pt'], [['pt-PT'], 'pt'], [['de-CH'], 'de'],
  [['fr-CH', 'pt-BR', 'de'], 'pt'], [['de-CH', 'pt-BR'], 'de'], [['en-US'], 'en'], [['fr-CH'], 'de'],
] as const) test(`first login uses browser languages: ${languages.join(',')}`, async ({ page }) => {
  await page.addInitScript(languages => Object.defineProperty(navigator, 'languages', { value: languages }), [...languages]);
  await page.goto('/login.html');
  await expect(page.locator(`[data-language="${expected}"]`)).toHaveAttribute('aria-pressed', 'true');
  const manual = expected === 'pt' ? 'de' : 'pt';
  await page.locator(`[data-language="${manual}"]`).click();
  await page.reload();
  await expect(page.locator(`[data-language="${manual}"]`)).toHaveAttribute('aria-pressed', 'true');
});
test('browser language works when preferences cannot be stored', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: [] });
    Object.defineProperty(navigator, 'language', { value: 'pt-BR' });
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.goto('/login.html?error=1');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('#error')).toHaveText('A senha está incorreta.');
  await page.locator('[data-language="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
for (const language of ['de', 'pt', 'en']) test(`login language carries through to chronicle and printing: ${language}`, async ({ page }, info) => {
  await page.goto('/login.html?error=1');
  await page.locator(`[data-language="${language}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language === 'pt' ? 'pt-BR' : language);
  await expect(page.locator('#error')).toHaveText(language === 'pt' ? 'A senha está incorreta.' : language === 'en' ? 'The password is incorrect.' : 'Das Passwort ist nicht korrekt.');
  await page.reload();
  await expect(page.locator(`[data-language="${language}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('login-language.png') });
  await page.locator('#password').fill('fixture-admin');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.archive-navigation')).toBeVisible();
  await page.locator('[data-view="chronicle"]').click();
  await page.locator(`[data-chapter="intro${language === 'de' ? '' : '.' + language}.md"]`).click();
  await expect(page.locator('.chapter-heading h2')).toHaveText(language === 'pt' ? 'História de teste' : language === 'en' ? 'Test story' : 'Testgeschichte');
  await page.locator('.archive-menu summary').click();
  await page.locator('[data-view="admin"]').click();
  await expect(page.locator('#bookLanguage, .book-export-controls select')).toHaveCount(0);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('[data-print-book]').click();
  await expect(page.locator('.print-chapter .chapter-heading h2')).toHaveText(language === 'pt' ? 'História de teste' : language === 'en' ? 'Test story' : 'Testgeschichte');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const other = language === 'pt' ? 'de' : 'pt';
  await page.locator('.archive-menu summary').click();
  await page.locator('[data-language-menu]').click();
  await page.locator(`[data-language="${other}"]`).click();
  await page.locator('[data-print-book]').click();
  await expect(page.locator('.print-chapter .chapter-heading h2')).toHaveText(other === 'pt' ? 'História de teste' : 'Testgeschichte');
});
