import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page, context, baseURL }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // External requests cannot reach GitHub or any real service from these tests.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL!).origin ? route.continue() : route.abort();
    });
    await use(errors);
    expect(errors, 'Unhandled browser errors').toEqual([]);
  }, { auto: true }],
});

export async function login(page: Page, password = 'fixture-admin') {
  await page.goto('/');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.archive-navigation')).toBeVisible();
}

export async function openGraphPerson(page: Page, id: string, touch = false) {
  const button = page.locator(`[data-family-person="${id}"] .person-open`);
  await expect(button).toBeVisible();
  if (touch) await button.tap(); else await button.click();
}

export async function expectGraphFits(page: Page) {
  await expect.poll(() => page.locator('.family-viewport').evaluate(v => {
    const plane = v.querySelector('.family-plane')!.getBoundingClientRect(), view = v.getBoundingClientRect();
    return plane.left >= view.left && plane.top >= view.top && plane.right <= view.left + v.clientWidth && plane.bottom <= view.top + v.clientHeight;
  })).toBe(true);
}

export async function selectGraphView(page: Page, mode: string) {
  const labels: Record<string, string> = { family: 'Familie', hourglass: 'Sanduhr', descendants: 'Nachkommen', ancestors: 'Fächer', connections: 'Verbindung' };
  await page.getByRole('radiogroup', { name: 'Ansicht', exact: true }).getByRole('radio', { name: labels[mode], exact: true }).check();
}

export async function changeZoom(page: Page, factor: number) {
  const button = page.getByRole('button', { name: factor > 1 ? 'Vergrössern' : 'Verkleinern', exact: true });
  await expect(page.locator('.graph-fit')).toBeEnabled();
  if (await button.isVisible()) { await button.click(); await expect(page.locator('.graph-fit')).toBeEnabled(); return; }
  await page.locator('.family-viewport').evaluate((v, factor) => {
    const box = v.getBoundingClientRect();
    v.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -Math.log(factor) * 100,
      clientX: box.left + v.clientWidth / 2, clientY: box.top + v.clientHeight / 2, bubbles: true, cancelable: true }));
  }, factor);
  await expect(page.locator('.graph-fit')).toBeEnabled();
}
