import { expect, type Page } from '@playwright/test';
import { test, login, selectGraphView, changeZoom } from './support';

async function camera(page: Page) {
  return page.locator('.family-plane').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, scale: new DOMMatrix(getComputedStyle(el).transform).a };
  });
}

async function expectCameraUnchanged(page: Page, before: Awaited<ReturnType<typeof camera>>) {
  // Sample across rendering and ResizeObserver callbacks, so a delayed jump
  // cannot pass merely because the first assertion ran before re-centering.
  const drift = await page.locator('.family-plane').evaluate(async (el, before) => {
    let position = 0, scale = 0;
    for (let frame = 0; frame < 10; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const rect = el.getBoundingClientRect();
      position = Math.max(position, Math.abs(rect.x - before.x), Math.abs(rect.y - before.y));
      scale = Math.max(scale, Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - before.scale));
    }
    return { position, scale };
  }, before);
  expect(drift.position).toBeLessThan(1);
  expect(drift.scale).toBeLessThan(.000001);
}

for (const mode of ['family', 'hourglass', 'descendants', 'connections', 'ancestors']) {
  test(`person information preserves the panned graph in ${mode}`, async ({ page, isMobile }) => {
    await login(page, 'fixture-reader');
    await selectGraphView(page, mode);
    await expect(page.locator('.graph-fit')).toBeEnabled();
    await changeZoom(page, 1.2);
    const target = mode === 'ancestors'
      ? page.locator('[data-fan-slot="1"] circle')
      : page.locator('[data-family-person="person_a"] .person-open');
    await target.scrollIntoViewIfNeeded();
    const viewport = page.locator('.family-viewport');
    // Place the trigger off-centre but fully inside the viewport. Otherwise
    // Playwright would scroll a partly clipped button before clicking it.
    await target.evaluate(el => {
      const v = el.closest('.family-viewport')!, view = v.getBoundingClientRect(), box = el.getBoundingClientRect();
      v.scrollLeft += box.left + box.width / 2 - view.left - v.clientWidth * .4;
      v.scrollTop += box.top + box.height / 2 - view.top - v.clientHeight * .4;
    });
    const before = await camera(page);
    await target.click();
    const dialog = page.locator('#personDialog');
    await expect(dialog).toBeVisible();
    await expectCameraUnchanged(page, before);

    await dialog.locator('[data-info-person="person_b"]').click();
    await expect(page.locator('#family-person-title')).toHaveText('Test Bruno');
    await expectCameraUnchanged(page, before);
    await page.goBack();
    await expect(page.locator('#family-person-title')).toHaveText('Test Anna');
    await expectCameraUnchanged(page, before);

    if (isMobile) {
      for (const level of ['collapsed', 'half', 'full']) {
        await dialog.locator('[data-sheet-toggle]').click();
        await expect(dialog).toHaveAttribute('data-panel-level', level);
        await expectCameraUnchanged(page, before);
      }
    }
    // Closing must retain even a pan made while information was open.
    await viewport.evaluate(el => el.scrollBy(19, 23));
    const panned = await camera(page);
    await dialog.locator('.dialog-close').click();
    await expect(dialog).toHaveCount(0);
    await expectCameraUnchanged(page, panned);
  });
}
