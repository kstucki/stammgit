import fs from 'node:fs';
import YAML from 'yaml';
import { expect, type Page } from '@playwright/test';
import { test, selectGraphView, expectGraphFits } from './support';

test.use({ showWelcome: true });
async function firstLogin(page: Page) {
  await page.goto('/');
  await page.locator('#password').fill('fixture-reader');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.welcome-page')).toBeVisible();
}
test('first visit without selection and returning visit', async ({ page }, info) => {
  await firstLogin(page);
  await expect(page.getByRole('heading', { name: 'Willkommen im Stammbaum' })).toBeVisible();
  await expect(page.locator('.welcome-tips li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Stammbaum öffnen', exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('welcome.png') });
  await page.getByRole('button', { name: 'Stammbaum öffnen', exact: true }).click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_a');
  await expectGraphFits(page);
  expect(await page.evaluate(() => Number(localStorage.getItem('graphZoom')))).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('stammbaum.welcomeSeen'))).toBe('true');
  expect(await page.evaluate(() => localStorage.getItem('stammbaum.me'))).toBeNull();
  await page.reload();
  await expect(page.locator('.family-view')).toBeVisible();
  await expect(page.locator('.welcome-page')).toHaveCount(0);
});
test('welcome selection and identity navigation preserve an existing zoom', async ({ page }) => {
  await firstLogin(page);
  const search = page.locator('#welcome-person');
  await search.fill('Bruno'); await search.press('Enter');
  await expect(page.locator('.identity-chip')).toContainText('Bruno');
  await page.locator('.identity-chip button').click();
  await expect(page.locator('.identity-chip')).toHaveCount(0);
  await search.fill('Bruno'); await search.press('Enter');
  await page.evaluate(() => localStorage.setItem('graphZoom', '1.2'));
  await page.getByRole('button', { name: 'Stammbaum öffnen', exact: true }).click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_b');
  await expect(page.locator('[data-zoom-level]')).toHaveText('120 %');
  expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe('1.2');
  expect(await page.evaluate(() => localStorage.getItem('stammbaum.me'))).toBe('person_b');
  await page.goto('/');
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_b');
  await expect(page.locator('[data-zoom-level]')).toHaveText('120 %');
  await page.locator('[data-family-person="person_a"] .person-focus').click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_a');
  await expect(page.locator('[data-zoom-level]')).toHaveText('120 %');
});
for (const [lang, title, next] of [
  ['pt', 'Bem-vindo à árvore genealógica', 'Abrir a árvore'],
  ['en', 'Welcome to your family tree', 'Open family tree'],
]) test(`welcome follows active language: ${lang}`, async ({ page }) => {
  await firstLogin(page);
  await page.goto('/?language=' + lang);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: next, exact: true }).click();
  await expect(page.locator('.family-view')).toBeVisible();
});
test('deleted identity is silently cleared and copied links retain their centre', async ({ page }) => {
  await firstLogin(page);
  await page.getByRole('button', { name: 'Stammbaum öffnen', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('stammbaum.me', 'deleted-person'));
  await page.goto('/');
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_a');
  expect(await page.evaluate(() => localStorage.getItem('stammbaum.me'))).toBeNull();
  await page.evaluate(() => localStorage.setItem('stammbaum.me', 'person_b'));
  await page.goto('/?view=family&person=person_a');
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_a');
  await page.goto('/');
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_b');
});
test('unavailable storage does not block welcome or the tree', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await firstLogin(page);
  await page.locator('#welcome-person').fill('Bruno'); await page.locator('#welcome-person').press('Enter');
  await page.getByRole('button', { name: 'Stammbaum öffnen', exact: true }).click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_b');
  await page.reload();
  await expect(page.locator('.welcome-page')).toBeVisible();
});
