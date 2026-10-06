import { test as base, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

export const test = base.extend<{ browserErrors: string[]; showWelcome: boolean }>({
  showWelcome: [false, { option: true }],
  browserErrors: [async ({ page, context, baseURL, showWelcome, browserName }, use, testInfo) => {
    // Existing feature tests represent returning visitors; onboarding opts in below.
    if (!showWelcome) await context.addInitScript(skipWelcome);
    const errors: string[] = [];
    // Keep the known WebKit delivery notice visible in reports; do not suppress
    // other ResizeObserver errors or the same message from other browsers.
    page.on('pageerror', error => {
      if (browserName === 'webkit' && error.message === 'ResizeObserver loop completed with undelivered notifications.') {
        if (!testInfo.annotations.some(a => a.type === 'webkit-layout-notice'))
          testInfo.annotations.push({ type: 'webkit-layout-notice', description: error.message });
      } else errors.push(error.message);
    });
    // External requests cannot reach GitHub or any real service from these tests.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL!).origin ? route.continue() : route.abort();
    });
    await use(errors);
    expect(errors, 'Unhandled browser errors').toEqual([]);
  }, { auto: true }],
});

const skipWelcome = () => { if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('stammbaum.welcomeSeen', 'true'); };

/** A second, empty browser profile of a returning visitor, limited to the test server. */
export async function freshContext(browser: Browser, options: Parameters<Browser['newContext']>[0] & { baseURL: string }) {
  const fresh = await browser.newContext(options);
  await fresh.addInitScript(skipWelcome);
  await fresh.route('**/*', route => new URL(route.request().url()).origin === new URL(options.baseURL).origin ? route.continue() : route.abort());
  return fresh;
}

export async function login(page: Page, password = 'fixture-admin') {
  await page.goto('/');
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.archive-navigation')).toBeVisible();
}

// Admin lives in the archive menu, not in the main navigation.
export async function openAdmin(page: Page) {
  const menu = page.locator('.archive-menu');
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
  await page.locator('.archive-menu [data-view="admin"]').click();
  await expect(page.locator('#treeSelect')).toBeVisible();
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
  if (await button.isVisible()) { await button.click(); await expect(page.locator('.graph-fit')).toBeEnabled(); return; }
  await page.locator('.family-viewport').evaluate((v, factor) => {
    const box = v.getBoundingClientRect();
    v.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -Math.log(factor) * 100,
      clientX: box.left + v.clientWidth / 2, clientY: box.top + v.clientHeight / 2, bubbles: true, cancelable: true }));
  }, factor);
  await expect(page.locator('.graph-fit')).toBeEnabled();
}
