import { expect } from '@playwright/test';
import { changeZoom, test, login } from './support';
const fixture = { meta: { focusPersonId: 'a' }, people: {
  a: { name: 'Anna', partners: ['b'], siblings: ['s'], children: ['child'], parents: ['s'] },
  b: { name: 'Berta', partners: ['a'], parents: ['t'], children: ['child'] },
  child: { name: 'Kind', parents: ['a', 'b'], children: ['leaf'], parentDetails: { a: { type: 'adoptive' } } },
  s: { name: 'Schwester', siblings: ['a'], children: ['a'], partners: ['t'] },
  t: { name: 'Theo', partners: ['s'], children: ['b'] },
  leaf: { name: 'Seitenzweig', parents: ['child'] }, alone: { name: 'Unverbunden' },
} };

test('connections show all routes, preserve marriage and adopted child and support unlimited selection removal', async ({ page }, testInfo) => {
  await login(page);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
  await page.goto('/');
  await expect(page.locator('.archive-navigation [data-view="connections"]')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Verbindung', exact: true }).check();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await expect(page.locator('[data-family-person="a"]')).toBeVisible();
  await page.locator('#connection-search').fill('Berta');
  await page.locator('[data-search-person="b"]').click();
  await expect(page.locator('[data-family-person]')).toHaveCount(4);
  await expect(page.locator('[data-partnership]')).toHaveCount(2);
  await expect(page.locator('[data-child="child"]')).toHaveCount(0);
  await expect(page.locator('[data-sibling-link]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="leaf"]')).toHaveCount(0);
  await expect(page.locator('.central-person')).toHaveCount(2);
  expect(await page.locator('[data-family-person]').evaluateAll(cards => new Set(cards.map(card => card.getAttribute('data-family-person'))).size)).toBe(4);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('connections.png'), fullPage: true });
  // A selected child remains visible; removing its selection hides this redundant leaf.
  await page.locator('#connection-search').fill('Kind'); await page.locator('[data-search-person="child"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await expect(page.locator('[data-child="child"]')).toHaveCount(1);
  await expect(page.locator('[data-relationship-note="child"][data-parent="a"]')).toContainText('Adoption');
  await page.getByRole('button', { name: 'Aus Auswahl entfernen: Kind', exact: true }).click();
  await expect(page.locator('[data-family-person="child"]')).toHaveCount(0);
  await page.locator('#connection-search').fill('Unverbunden'); await page.locator('[data-search-person="alone"]').click();
  await expect(page.locator('#connectionPanel [role="status"]')).toContainText('Keine dokumentierte Verbindung');
  await expect(page.locator('[data-family-person="alone"]')).toHaveCount(1);
  await page.reload(); await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await changeZoom(page, 1 / 1.2);
  const zoom = await page.locator('[data-zoom-level]').innerText();
  await page.getByRole('radio', { name: 'Familie', exact: true }).check();
  await page.getByRole('radio', { name: 'Verbindung', exact: true }).check();
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await page.reload();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  for (const name of ['Unverbunden', 'Berta', 'Anna']) await page.getByRole('button', { name: `Aus Auswahl entfernen: ${name}`, exact: true }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(0);
  await page.reload(); await expect(page.locator('[data-family-person]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('person action searches, cancels without changing selection, and resets to exactly the chosen pair', async ({ page }) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
  await page.goto('/?view=connections&connect=a&connect=b&connect=alone');
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.locator('[data-family-person="a"] .person-open').click();
  await page.getByRole('button', { name: 'Verbindung', exact: true }).click();
  await page.locator('#connection-target').fill('Anna');
  await expect(page.locator('#connection-target-results [data-search-person="a"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Verbindung', exact: true }).click();
  await page.locator('#connection-target').fill('Kind');
  await page.locator('#connection-target-results [data-search-person="child"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(2);
  await expect(page.locator('[data-connection-selected="a"]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="child"]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="alone"]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="b"]')).toHaveCount(1);
  await expect(page.locator('#personDialog')).toHaveCount(0);
});

// Open question (05.10.2026): without «Ich» the connection tab starts with the person centered at
// page load, not with the current tree center.
test('first connection tab uses the current tree center', async ({ page }) => {
  await login(page);
  await page.locator('#family-search').fill('Test Clara');
  await page.locator('[data-search-person="person_c"]').click();
  await page.getByRole('radio', { name: 'Verbindung', exact: true }).check();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  test.fail(true, 'Known bug: first connection selection retains the center from page load.');
  await expect(page.locator('[data-connection-selected="person_c"]')).toHaveCount(1);
});

test('connection dialog action works from the family tree', async ({ page }) => {
  await login(page);
  await page.locator('#family-search').fill('Test Clara');
  await page.locator('[data-search-person="person_c"]').click();
  await page.locator('[data-family-person="person_c"] .person-open').click();
  await page.getByRole('button', { name: 'Verbindung', exact: true }).click();
  await page.locator('#connection-target').fill('Test Anna');
  await page.locator('#connection-target-results [data-search-person="person_a"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(2);
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
});

// Known engine bug (05.10.2026): the settled layout puts partners with fixed ancestry on one row,
// against the ancestry rule in docs/architecture.md. Executed as an expected failure until fixed.
test('ancestry outranks marriage in a large connection graph rendered by the worker', async ({ page }) => {
  await login(page);
  const people: Record<string, { name?: string; parents?: string[]; partners?: string[]; children?: string[] }> = {
    root: { children: ['a', 'b'] }, a: { parents: ['root'], children: ['branch_a'] },
    b: { parents: ['root'], children: ['c'] }, c: { parents: ['b'], children: ['spouse_a'] },
    branch_a: { name: 'Branch A', parents: ['a'], partners: ['spouse_a'], children: ['n0'] },
    spouse_a: { name: 'Spouse A', parents: ['c'], partners: ['branch_a'], children: ['n0'] },
  };
  for (let i = 0; i < 85; i++) people[`n${i}`] = { parents: i ? [`n${i-1}`] : ['branch_a', 'spouse_a'], children: i < 84 ? [`n${i+1}`] : [] };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'root' }, people } }));
  let workers = 0; page.on('worker', () => workers++);
  await page.goto('/?view=family&action=connections&connect=root&connect=n84');
  await expect(page.locator('[data-family-person]')).toHaveCount(91);
  expect(workers).toBeGreaterThan(0);
  // The worker result and measured card heights arrive after the first paint.
  const rows = () => page.locator('[data-family-person="branch_a"], [data-family-person="spouse_a"], [data-family-person="n0"]').evaluateAll(elements => {
    const y = Object.fromEntries(elements.map(el => [el.getAttribute('data-family-person'), parseFloat((el.closest('.family-node') as HTMLElement).style.top)]));
    return [y.spouse_a > y.branch_a, y.n0 > y.spouse_a, y.n0 > y.branch_a];
  });
  await expect.poll(async () => (await rows()).slice(1)).toEqual([true, true]);
  test.fail(true, 'Known engine bug: fixed ancestry is flattened by a partnership in the worker layout.');
  await expect.poll(async () => (await rows())[0]).toBe(true);
});

test('hiding a redundant child preserves the existing co-parent bridge without inventing a marriage', async ({ page }) => {
  await login(page);
  const people = { a: { children: ['child'] }, b: { children: ['child'] }, child: { parents: ['a', 'b'] } };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'a' }, people } }));
  await page.goto('/?view=family&action=connections&connect=a&connect=b');
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await expect(page.locator('[data-child]')).toHaveCount(0);
  await expect(page.locator('[data-family-connection]')).toHaveCount(1);
  await expect(page.locator('[data-partnership]')).toHaveCount(0);
  await expect(page.locator('#connectionPanel [role="status"]')).toHaveCount(0);
});

test('sisters stay together when their descendants marry across generations', async ({ page }) => {
  await login(page);
  const people = {
    root: { children: ['branch_a', 'branch_b'] },
    branch_a: { parents: ['root'], partners: ['spouse_a'], children: ['descendant_a'] },
    spouse_a: { partners: ['branch_a'], children: ['descendant_a'] },
    branch_b: { parents: ['root'], children: ['descendant_b'] },
    descendant_b: { parents: ['branch_b'], children: ['descendant_c'] },
    descendant_c: { parents: ['descendant_b'], partners: ['descendant_a'] },
    descendant_a: { parents: ['branch_a', 'spouse_a'], partners: ['descendant_c'] },
  };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'branch_b' }, people } }));
  await page.goto('/?view=family&action=connections&connect=branch_b&connect=descendant_c');
  await expect(page.locator('[data-family-person]')).toHaveCount(7);
  const rows = () => page.locator('[data-family-person]').evaluateAll(elements => {
    const y = Object.fromEntries(elements.map(el => [el.getAttribute('data-family-person'), el.getBoundingClientRect().top]));
    return [y.branch_a === y.branch_b, y.branch_a === y.spouse_a, y.descendant_a === y.descendant_b, y.descendant_c > y.descendant_a];
  });
  await expect.poll(rows).toEqual([true, true, true, true]);
  await expect(page.locator('[data-partnership]')).toHaveCount(2);
  await expect(page.locator('[data-child]')).toHaveCount(5);
});

test('a loop attached at one family point disappears and returns when selected', async ({ page }) => {
  await login(page);
  const people = {
    h: { name: 'Heinrich', partners: ['i'], children: ['e', 'd'] },
    i: { name: 'Parent B', partners: ['h'], parents: ['m'], children: ['e', 'd'] },
    e: { name: 'Elisabeth', parents: ['h', 'i'], partners: ['u'] },
    d: { name: 'Dieter', parents: ['h', 'i'] },
    u: { name: 'Partner C', partners: ['e', 'c'] },
    c: { name: 'Carla', partners: ['u'], parents: ['m'] }, m: { children: ['i', 'c'] },
  };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'h' }, people } }));
  await page.goto('/?view=family&action=connections&connect=h&connect=d');
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await expect(page.locator('[data-child="e"]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="c"]')).toHaveCount(0);
  await expect(page.locator('[data-family-connection]')).toHaveCount(1);
  await page.locator('#connection-search').fill('Carla');
  await page.locator('[data-search-person="c"]').click();
  await expect(page.locator('[data-family-person]')).toHaveCount(7);
  await expect(page.locator('[data-child="e"]')).toHaveCount(1);
  await expect(page.locator('[data-partnership]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Aus Auswahl entfernen: Carla', exact: true }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
});



test('wrapped connection selections stay in the panel without moving the canvas', async ({ page }) => {
  await login(page);
  const ids = Array.from({ length: 12 }, (_, i) => `selected_${i}`);
  const people = Object.fromEntries(ids.map((id, i) => [id, {
    name: `Selected person ${i} with a deliberately long fixture name`,
    partners: ids.filter((_, j) => Math.abs(i - j) === 1),
  }]));
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: ids[0] }, people } }));
  const open = async (count: number) => {
    await page.goto('/?view=family&action=connections&' + ids.slice(0, count).map(id => `connect=${id}`).join('&'));
    await expect(page.locator('[data-connection-selected]')).toHaveCount(count);
    await expect(page.locator('#connectionPanel [data-connection-selected]')).toHaveCount(count);
    await expect(page.locator('.archive-header [data-connection-selected]')).toHaveCount(0);
    return page.locator('.family-viewport').boundingBox();
  };
  const before = (await open(2))!;
  const expanded = (await open(12))!;
  expect(expanded.y).toBeCloseTo(before.y, 0);
  expect(expanded.height).toBeCloseTo(before.height, 0);
  const restored = (await open(2))!;
  expect(restored.y).toBeCloseTo(before.y, 0);
  expect(restored.height).toBeCloseTo(before.height, 0);
});
