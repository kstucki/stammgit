import { expect } from '@playwright/test';
import { changeZoom, test, login, openGraphPerson, expectGraphFits, selectGraphView } from './support';

test('all views preserve camera geometry while zooming, keep the window and center stable, and fit each view on its intended axes', async ({ page, isMobile }, testInfo) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  const frame = page.locator('.graph-frame'), viewport = page.locator('.family-viewport');
  const fit = page.getByRole('button', { name: 'Einpassen', exact: true });
  async function camera() {
    return viewport.evaluate(v => {
      const p = v.querySelector('.family-plane')!, plane = p.getBoundingClientRect(), view = v.getBoundingClientRect();
      const scale = new DOMMatrix(getComputedStyle(p).transform).a;
      return { scale, x: (view.left + v.clientWidth / 2 - plane.left) / scale, y: (view.top + v.clientHeight / 2 - plane.top) / scale };
    });
  }
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
  for (const mode of ['family', 'hourglass', 'descendants']) {
    const previousZoom = mode === 'family' ? await page.locator('[data-zoom-level]').innerText() : await page.evaluate(() => `${Math.round(Number(localStorage.getItem('graphZoom')) * 1000) / 10} %`);
    await selectGraphView(page, mode);
    await expect(page.locator('[data-zoom-level]')).toHaveText(previousZoom);
    if (mode === 'family') await expectGraphFits(page);
    await fit.scrollIntoViewIfNeeded();
    const size = (await frame.boundingBox())!, initial = await camera();
    const tools = page.locator('.graph-tools'), toolbar = (await tools.boundingBox())!;
    const canvas = (await viewport.boundingBox())!;
    expect(toolbar.x).toBeGreaterThanOrEqual(size.x);
    expect(toolbar.y).toBeLessThan(size.y);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(canvas.y);
    const initialLabel = await page.locator('[data-zoom-level]').innerText();
    const people = await page.locator('[data-family-person]').evaluateAll(cards => cards.map(card => card.getAttribute('data-family-person')));
    const lines = await page.locator('.family-lines path').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
    await changeZoom(page, 1.2);
    await expect(page.locator('[data-zoom-level]')).toHaveText(`${Math.round(initial.scale * 1.2 * 1000) / 10} %`);
    const zoomed = await camera(), after = (await frame.boundingBox())!;
    expect(after.width).toBeCloseTo(size.width, 1); expect(after.height).toBeCloseTo(size.height, 1);
    expect(await tools.boundingBox()).toEqual(toolbar);
    expect(zoomed.scale).toBeCloseTo(initial.scale * 1.2);
    // Scroll positions may round to pixels: measure drift in screen pixels at any scale.
    expect(Math.abs(zoomed.x - initial.x) * zoomed.scale).toBeLessThan(1);
    expect(Math.abs(zoomed.y - initial.y) * zoomed.scale).toBeLessThan(1);
    await changeZoom(page, 1 / 1.2); await expect(page.locator('[data-zoom-level]')).toHaveText(initialLabel);
    if (!isMobile) {
      const beforeScroll = await viewport.evaluate(v => ({ x: v.scrollLeft, y: v.scrollTop }));
      await viewport.hover(); await page.mouse.wheel(90, 110);
      await expect.poll(() => viewport.evaluate(v => v.scrollLeft)).toBeGreaterThan(beforeScroll.x);
      await expect.poll(() => viewport.evaluate(v => v.scrollTop)).toBeGreaterThan(beforeScroll.y);
      await expect(page.locator('[data-zoom-level]')).toHaveText(initialLabel);
      expect(await tools.boundingBox()).toEqual(toolbar);
    }
    await fit.focus(); await fit.press('Enter');
    await expectGraphFits(page);
    const fitted = (await frame.boundingBox())!;
    expect(fitted.height).toBeCloseTo(size.height, 1); expect(fitted.width).toBeCloseTo(size.width, 1);
    const controls = (await page.locator('.graph-zoom').boundingBox())!;
    expect(controls.x + controls.width).toBeCloseTo(fitted.x + fitted.width, 0);
    expect(controls.y + controls.height).toBeCloseTo(fitted.y + fitted.height, 0);
    expect(await page.locator('[data-family-person]').evaluateAll(cards => cards.map(card => card.getAttribute('data-family-person')))).toEqual(people);
    expect(await page.locator('.family-lines path').evaluateAll(paths => paths.map(path => path.getAttribute('d')))).toEqual(lines);
  }
  await page.screenshot({ path: testInfo.outputPath('zoom-controls.png'), fullPage: true });
});

test('family fits explicitly, then preserves exact manual zoom across centers and navigation', async ({ page, isMobile }) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  const zoom = page.locator('[data-zoom-level]');
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
  await changeZoom(page, 1.2);
  const manual = await zoom.innerText();
  const scale = await page.locator('.family-plane').evaluate(el => getComputedStyle(el).transform);
  await openGraphPerson(page, 'lea', isMobile);
  await page.locator('#personDialog .dialog-close').click();
  await expect(zoom).toHaveText(manual);
  await selectGraphView(page, 'hourglass'); await selectGraphView(page, 'family');
  await expect(zoom).toHaveText(manual);
  await page.locator('#family-search').fill('Halbgeschwisterperson');
  await page.locator('[data-search-person="half"]').click();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'half');
  await expect(zoom).toHaveText(manual);
  await expect.poll(() => page.locator('.family-plane').evaluate(el => getComputedStyle(el).transform)).toBe(scale);
  await page.locator('.archive-menu summary').click();
  await page.locator('[data-view="sources"]').click();
  await page.locator('.archive-navigation a[href="/"]').click();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'half');
  await expect(zoom).toHaveText(manual);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
});

test('wide sibling groups fit completely and remain reachable after zooming', async ({ page }) => {
  await login(page);
  const children = Array.from({ length: 32 }, (_, i) => `child_${String(i).padStart(2, '0')}`);
  const people = Object.fromEntries([
    ['parent_a', { name: 'Elternteil A', children }], ['parent_b', { name: 'Elternteil B', children }],
    ...children.map(id => [id, { name: `Geschwister ${id}`, parents: ['parent_a', 'parent_b'] }]),
  ]);
  await page.evaluate(() => { sessionStorage.removeItem('graphState:demo'); localStorage.removeItem('graphZoom'); });
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: children[16] }, people } }));
  await page.reload();
  await expect(page.locator('[data-family-person]')).toHaveCount(34);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
  await page.locator('.family-viewport').evaluate(v => {
    const box = v.getBoundingClientRect(), p = v.querySelector('.family-plane')!;
    const scale = new DOMMatrix(getComputedStyle(p).transform).a;
    v.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -Math.log(.75 / scale) * 100,
      clientX: box.left + v.clientWidth / 2, clientY: box.top + v.clientHeight / 2, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.graph-fit')).toBeEnabled();
  const viewport = page.locator('.family-viewport');
  const zoom = await page.locator('[data-zoom-level]').innerText();
  const ends = await viewport.evaluate(v => {
    const cards = [...v.querySelectorAll<HTMLElement>('[data-family-person]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const first = cards[0], last = cards.at(-1)!, view = v.getBoundingClientRect();
    return { first: first.dataset.familyPerson!, last: last.dataset.familyPerson!,
      overflow: last.getBoundingClientRect().right - first.getBoundingClientRect().left > v.clientWidth
        && (first.getBoundingClientRect().right < view.left || last.getBoundingClientRect().left > view.right) };
  });
  expect(ends.overflow).toBe(true);
  // Exercise native horizontal scrolling independently of zoom and selection.
  for (const id of [ends.first, ends.last]) {
    const card = page.locator(`[data-family-person="${id}"]`);
    await card.evaluate(el => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
    // Compare bounds: Chromium can round a fully visible scaled card's
    // IntersectionObserver ratio to 0.99999988 instead of 1.
    await expect.poll(() => card.evaluate(el => {
      const box = el.getBoundingClientRect(), v = el.closest('.family-viewport')!, view = v.getBoundingClientRect();
      return box.left >= view.left && box.right <= view.left + v.clientWidth
        && box.top >= view.top && box.bottom <= view.top + v.clientHeight;
    })).toBe(true);
    await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  }
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
  await expect(page.locator('[data-zoom-level]')).not.toHaveText(zoom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('each graph mode preserves zoom when its center changes', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  for (const mode of ['family', 'hourglass', 'descendants']) {
    await selectGraphView(page, mode);
    await changeZoom(page, 1 / 1.2);
    const zoom = await page.locator('[data-zoom-level]').innerText();
    const transform = await page.locator('.family-plane').evaluate(el => getComputedStyle(el).transform);
    for (const [name, id] of [['Halbgeschwisterperson', 'half'], ['Lea', 'lea']]) {
      await page.locator('#family-search').fill(name);
      await page.locator(`[data-search-person="${id}"]`).click();
      await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', id);
      await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
      await expect.poll(() => page.locator('.family-plane').evaluate(el => getComputedStyle(el).transform)).toBe(transform);
    }
  }
});

test('one card zoom survives card views, reload and dataset change', async ({ page }) => {
  await login(page);
  await changeZoom(page, 1.2);
  const value = await page.locator('[data-zoom-level]').innerText();
  const scale = await page.locator('.family-plane').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  for (const mode of ['hourglass', 'descendants', 'connections', 'family']) {
    await selectGraphView(page, mode);
    await expect(page.locator('[data-zoom-level]')).toHaveText(value);
    expect(await page.locator('.family-plane').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(scale, 5);
  }
  await page.reload(); await expect(page.locator('[data-zoom-level]')).toHaveText(value);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.setItem('activeTree', 'complex'); });
  await page.reload(); await expect(page.locator('[data-zoom-level]')).toHaveText(value);
  expect(await page.locator('.family-plane').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(scale, 5);
});

// Known engine bug (05.10.2026): the settled layout puts partners with fixed ancestry on one row,
// against the ancestry rule in docs/architecture.md. Executed as an expected failure until fixed.
test('ancestry determines generations even when a marriage crosses rows', async ({ page }) => {
  await login(page);
  const people = {
    root: { children: ['a', 'b'] }, a: { parents: ['root'], children: ['wife'] },
    b: { parents: ['root'], children: ['c'] }, c: { parents: ['b'], children: ['husband'] },
    wife: { parents: ['a'], partners: ['husband'], children: ['child'] },
    husband: { parents: ['c'], partners: ['wife'], children: ['child'] }, child: { parents: ['wife', 'husband'] },
  };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'root' }, people } }));
  await page.goto('/?person=root&action=descendants');
  await expect(page.locator('[data-family-person]')).toHaveCount(7);
  // Rows settle once the measured card heights are known.
  const rows = () => page.locator('[data-family-person]').evaluateAll(elements => {
    const y = Object.fromEntries(elements.map(el => [el.getAttribute('data-family-person'), el.getBoundingClientRect().top]));
    return [y.husband > y.wife, y.child > y.husband, y.child > y.wife, y.wife > y.a, y.husband > y.c];
  });
  await expect.poll(async () => (await rows()).slice(1)).toEqual([true, true, true, true]);
  test.fail(true, 'Known engine bug: fixed ancestry is flattened by a partnership.');
  await expect.poll(async () => (await rows())[0]).toBe(true);
});
