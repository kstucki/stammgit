import fs from 'node:fs';
import YAML from 'yaml';
import { expect } from '@playwright/test';
import { openSource } from './source-support';
import { test, login, selectGraphView, changeZoom } from './support';
test('center, mode and panel are history entries; camera is not', async ({ page }) => {
  await login(page, 'fixture-reader'); await page.goto('/?view=family&person=person_a');
  await page.locator('[data-family-person="person_c"] .person-focus').click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_c');
  await page.locator('[data-family-person="person_a"] .person-focus').click();
  await page.goBack(); await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_c');
  await page.goBack(); await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_a');
  await selectGraphView(page, 'ancestors'); await page.goBack();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'family');
  await page.locator('[data-family-person="person_a"] .person-open').click();
  await expect(page).toHaveURL(/info=person_a/);
  await page.goBack(); await expect(page.locator('#personDialog')).toHaveCount(0);
  await page.goForward(); await expect(page.locator('#personDialog')).toBeVisible();
  await page.goBack(); const length = await page.evaluate(() => history.length);
  await changeZoom(page, 1.2); await page.locator('.family-viewport').evaluate(v => v.scrollTo(200, 200));
  expect(await page.evaluate(() => history.length)).toBe(length);
});
test('sections and chapter navigation restore with Back and Forward', async ({ page }) => {
  await login(page, 'fixture-reader'); await page.locator('[data-view="chronicle"]').click();
  await page.locator('[data-chapter="intro.md"]').click(); await expect(page.locator('.chronicle-chapter')).toBeVisible();
  await page.goBack(); await expect(page.locator('.chronicle-toc')).toBeVisible();
  await page.goBack(); await expect(page.locator('.family-view')).toBeVisible();
  await page.goForward(); await expect(page.locator('.chronicle-toc')).toBeVisible();
});
test('login preserves a shared destination and replaces the login entry', async ({ page }) => {
  await page.goto('/?view=family&person=person_b&language=pt');
  await page.locator('#password').fill('fixture-reader'); await page.locator('[type=submit]').click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'person_b');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.goBack(); expect(page.url()).not.toContain('login.html');
});

test('opening source person information keeps the source filter on both entries', async ({ page }) => {
  await login(page, 'fixture-reader'); await page.goto('/?view=sources');
  await page.locator('#sourcesSearch').fill('Testquelle');
  await page.locator('#sourcesSearch').press('Tab');
  const source = await openSource(page);
  await source.locator('[data-open-person="person_a"]').click();
  await expect(page.locator('#personDialog')).toContainText('Test Anna');
  await expect(page.locator('#sourcesSearch')).toHaveValue('Testquelle');
  await page.goBack(); await expect(page.locator('#personDialog')).toHaveCount(0);
  await expect(source).toBeVisible();
  await expect(page.locator('#sourcesSearch')).toHaveValue('Testquelle');
});
