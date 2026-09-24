import { expect } from '@playwright/test';
import { test, login, expectFamilyHeightFits, selectGraphView } from './support';

test('compact header and five shared card views keep the center and hourglass selection', async ({ page }, testInfo) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  await expect(page.locator('.archive-identity')).toHaveText('Testarchiv');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.dataset-summary, #family-heading, [data-view="overview"]')).toHaveCount(0);
  await expect(page.getByText('Eine kleine Testfamilie.', { exact: true })).toHaveCount(0);
  const selector = page.getByRole('radiogroup', { name: 'Ansicht', exact: true });
  await expect(page.locator('.graph-frame').getByRole('radiogroup', { name: 'Ansicht', exact: true })).toBeVisible();
  await expect(page.locator('.graph-frame #family-search')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ansicht', exact: true })).toHaveCount(0);
  await expect(selector.locator('.graph-mode-face > span')).toHaveText(['Familie', 'Vorfahren & Nachkommen', 'Nachkommen', 'Vorfahren', 'Verbindungen']);
  await expect(selector.locator('svg')).toHaveCount(5);
  for (const [mode, count] of [['family', 11], ['hourglass', 8], ['descendants', 6], ['ancestors', 3], ['connections', 1]] as const) {
    await selectGraphView(page, mode);
    await expect(selector.locator('input:checked')).toHaveValue(mode);
    await expect(page.locator('[data-family-person]')).toHaveCount(count);
    await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'lea');
    await expect(page.locator('[data-family-person="lea"] img')).toHaveAttribute('src', '/photos/test.png');
    expect(await page.locator('[data-family-person]').evaluateAll(cards => new Set(cards.map(card => card.getAttribute('data-family-person'))).size)).toBe(count);
  }
  await selectGraphView(page, 'hourglass');
  await page.locator('#family-search').fill('Halbgeschwisterperson');
  await page.getByRole('button', { name: 'Zur Sanduhr hinzufügen: Halbgeschwisterperson', exact: true }).click();
  await expect(page.locator('[data-family-person="p3"]')).toBeVisible();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'lea');
  await selectGraphView(page, 'family'); await selectGraphView(page, 'hourglass');
  await expect(page.locator('[data-family-person="half"]')).toBeVisible();
  await page.getByRole('button', { name: 'Aus der Sanduhr entfernen: Halbgeschwisterperson', exact: true }).click();
  await expect(page.locator('[data-family-person="half"]')).toHaveCount(0);
  await selectGraphView(page, 'family');
  await page.screenshot({ path: testInfo.outputPath('unified-family.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('larger portrait and a very long name remain fully inside a growing card with connected lines', async ({ page }, testInfo) => {
  await login(page);
  const name = 'Alexandria Frederike Maximiliane Descendant A Charlotte von Beispielhausen und Musterberg mit einem besonders langen vollständig sichtbaren Familiennamen';
  await page.evaluate(() => { sessionStorage.removeItem('graphState:demo'); localStorage.removeItem('graphZoom'); });
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    data.people.person_a.name = name; data.people.person_a.photo = '/photos/test.png';
    await route.fulfill({ json: data });
  });
  await page.reload();
  const card = page.locator('[data-family-person="person_a"]');
  await expect(card.locator('strong')).toHaveText(name);
  const sizes = await card.evaluate(el => {
    const title = el.querySelector('strong')!, photo = el.querySelector('img')!, footer = el.querySelector('.center-marker')!;
    return { height: el.clientHeight, clipped: title.scrollHeight > title.clientHeight,
      titleBottom: title.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top,
      photo: [photo.clientWidth, photo.clientHeight] };
  });
  expect(sizes.photo).toEqual([62, 73]); expect(sizes.height).toBeGreaterThan(174);
  expect(sizes.clipped).toBe(false); expect(sizes.titleBottom).toBeLessThan(sizes.footerTop);
  await expectFamilyHeightFits(page);
  await expect.poll(async () => page.locator('[data-family-connection]').evaluate(bridge => {
    const path = bridge as SVGPathElement, point = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
    const cards = ['person_a', 'person_b'].map(id => document.querySelector(`[data-family-person="${id}"]`)!.getBoundingClientRect()).sort((a,b) => a.x - b.x);
    return Math.abs(point.y - cards[0].bottom);
  })).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('unclipped-name.png'), fullPage: true });
  await card.locator('.person-open').click(); await expect(page.locator('#personDialog')).toContainText(name);
});

test('view bar supports keyboard selection and reveals views inside its own mobile scroll area', async ({ page, isMobile }) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  const bar = page.getByRole('radiogroup', { name: 'Ansicht', exact: true });
  const geometry = await bar.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
  if (isMobile) expect(geometry.content).toBeGreaterThan(geometry.width);
  else expect(geometry.content).toBe(geometry.width);
  const bounds = (await bar.boundingBox())!, search = (await page.locator('#family-search').boundingBox())!;
  if (isMobile) expect(search.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  else expect(Math.abs(search.y - bounds.y)).toBeLessThan(5);

  await bar.getByRole('radio', { name: 'Familie', exact: true }).focus();
  const pageTop = await page.evaluate(() => scrollY);
  for (const [label, count] of [['Vorfahren & Nachkommen', 8], ['Nachkommen', 6], ['Vorfahren', 3], ['Verbindungen', 1]] as const) {
    await page.keyboard.press('ArrowRight');
    const selected = bar.getByRole('radio', { name: label, exact: true });
    await expect(selected).toBeChecked(); await expect(selected).toBeFocused();
    await expect(bar.locator('input:checked')).toHaveCount(1);
    await expect(page.locator('[data-family-person]')).toHaveCount(count);
    await expect.poll(() => selected.evaluate(el => {
      const item = el.getBoundingClientRect(), bar = el.closest('.graph-view-switcher')!, area = bar.getBoundingClientRect();
      return item.left >= area.left && item.right <= area.left + bar.clientWidth;
    })).toBe(true);
    const hitArea = (await selected.boundingBox())!;
    expect(hitArea.width).toBeGreaterThanOrEqual(44); expect(hitArea.height).toBeGreaterThanOrEqual(44);
  }
  if (isMobile) expect(await bar.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(pageTop);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Native WebKit radios stop at the end; return using the opposite direction.
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowLeft');
  await expect(bar.getByRole('radio', { name: 'Familie', exact: true })).toBeChecked();
  await expectFamilyHeightFits(page);

  await page.goto('/?person=lea&action=descendants');
  await expect(bar.getByRole('radio', { name: 'Nachkommen', exact: true })).toBeChecked();
  await expect(bar.getByRole('radio', { name: 'Nachkommen', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-family-person]')).toHaveCount(6);
});

test('large selections render through a worker and can be replaced by a local family view', async ({ page }) => {
  await login(page);
  const people = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`n${i}`, {
    name: `Generation ${i}`, ...(i ? { parents: [`n${i-1}`] } : {}), ...(i < 99 ? { children: [`n${i+1}`] } : {}),
  }]));
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'n99' }, people } }));
  let workers = 0; page.on('worker', () => workers++);
  await page.reload();
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await expect(page.locator('.person-count')).toHaveCount(0);
  await selectGraphView(page, 'ancestors');
  await expect(page.locator('[data-family-person]')).toHaveCount(100);
  expect(workers).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expect.poll(() => page.locator('[data-zoom-level]').innerText().then(text => parseFloat(text))).toBeLessThan(8);
  expect(await page.locator('.family-viewport').evaluate(v => {
    const view = v.getBoundingClientRect(), plane = v.querySelector('.family-plane')!.getBoundingClientRect();
    return plane.top >= view.top && plane.bottom <= view.top + v.clientHeight;
  })).toBe(true);
  await selectGraphView(page, 'family');
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await selectGraphView(page, 'hourglass');
  await selectGraphView(page, 'family');
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test('hourglass roots, mode and zoom survive section changes, reload and a new center', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { localStorage.setItem('activeTree', 'complex'); localStorage.removeItem('graphZoom'); }); await page.reload();
  await selectGraphView(page, 'hourglass');
  await page.locator('#family-search').fill('Halbgeschwisterperson');
  await page.getByRole('button', { name: 'Zur Sanduhr hinzufügen: Halbgeschwisterperson', exact: true }).click();
  await page.getByRole('button', { name: 'Verkleinern', exact: true }).click();
  const zoom = await page.locator('[data-zoom-level]').innerText();
  const ids = await page.locator('[data-family-person]').evaluateAll(cards => cards.map(card => card.getAttribute('data-family-person')).sort());
  await page.locator('[data-view="admin"]').click();
  await page.locator('.archive-navigation a[href="/"]').click();
  await page.reload();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'hourglass');
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await expect.poll(() => page.locator('[data-family-person]').evaluateAll(cards => cards.map(card => card.getAttribute('data-family-person')).sort())).toEqual(ids);
  await page.locator('#family-search').fill('Halbgeschwisterperson');
  await page.locator('[data-search-person="half"]').click();
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'half');
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
});

test('removed full mode is absent and a saved full selection falls back safely', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    sessionStorage.setItem('graphState:demo', JSON.stringify({ mode: 'full', roots: ['person_a'], scales: { full: .1 } }));
    localStorage.setItem('graphZoom', JSON.stringify(.42));
  });
  await page.reload();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'family');
  await expect(page.getByRole('radio')).toHaveCount(5);
  await expect(page.getByRole('radio', { name: 'Gesamt', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-zoom-level]')).toHaveText('42 %');
  expect(await page.locator('.family-plane').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(.42);
});
