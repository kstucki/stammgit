import { expect, type Page } from '@playwright/test';
import { test, login } from './support';
import type { Dataset } from '../../src/domain/person';

const fixture = (): Dataset => ({ meta: { focusPersonId: 'a', title: 'Historische Verbindungen' }, people: {
  a: { name: 'Person A', living: false, partners: ['b','c'], children: ['child'], associations: {
    h: { type: 'enslavement', documented: ['1841','1846'], sources: [{ label: 'Register', url: '/sources/test.pdf#page=1' }] },
  } },
  b: { name: 'Person B', living: false, partners: ['a'], children: ['child'] },
  c: { name: 'Person C', living: false, partners: ['a'] },
  child: { name: 'Child', living: false, parents: ['a','b'] },
  h: { name: 'Person H', living: false, notes: ['Eine eigenständige Biografie.'], notes_en: ['An independent biography.'], notes_pt: ['Uma biografia própria.'] },
  isolated: { name: 'Separate', living: false },
} });
async function load(page: Page, data = fixture(), role = 'reader') {
  await login(page, `fixture-${role}`);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: data }));
  await page.goto('/?person=a&action=family');
  await expect(page.locator('.archive-navigation')).toBeVisible();
}
async function sameRow(page: Page, a: string, b: string) {
  await expect.poll(() => page.locator('.family-node').evaluateAll((nodes, ids) => {
    const node = (id: string) => nodes.find(node => node.querySelector(`[data-family-person="${id}"]`)) as HTMLElement | undefined;
    return !!node(ids[0]) && !!node(ids[1]) && node(ids[0])!.style.top === node(ids[1])!.style.top;
  }, [a,b])).toBe(true);
}

test('historical connection sits beside the person in all card views and opens both roles', async ({ page }, info) => {
  await load(page);
  for (const action of ['family','tree','descendants','connections']) {
    await page.goto(`/?person=a&action=${action}${action==='connections'?'&connect=a&connect=h':''}`);
    await expect(page.locator('[data-family-person="h"]')).toBeVisible();
    await sameRow(page,'a','h');
    await expect(page.locator('[data-association]')).toHaveCount(1);
    await expect(page.locator('[data-association]')).not.toHaveAttribute('data-partnership');
    await expect(page.locator('[data-association-label]')).toContainText('belegt 1841, 1846');
  }
  await page.goto('/?person=a&action=family');
  await page.screenshot({path: info.outputPath('historical-connection.png')});
  await page.locator('[data-association-label]').click();
  await expect(page.locator('#family-person-title')).toHaveText('Person H');
  const historical = page.locator('[data-family-chip^="relAssociations:"]');
  await expect(historical).toContainText('Wurde versklavt von');
  await expect(page.locator('[data-family-chip^="relPartners:"]')).toHaveCount(0);
  await historical.getByRole('button').click();
  await expect(page.locator('#family-person-title')).toHaveText('Person A');
  await expect(historical).toContainText('Hielt in Sklaverei');
  await page.goto('/?person=h&action=ancestors');
  await expect(page.locator('[data-association]')).toHaveCount(0);
  await expect(page.locator('[data-fan-person="a"]')).toHaveCount(0);
});

test('historical editor preserves person drafts and evidence through save, reload and removal', async ({ page }, info) => {
  await load(page,fixture(),'admin');
  await page.goto('/?person=h&action=edit');
  await page.locator('[name="notes"]').fill('Geänderte Beschreibung.');
  await page.locator('#editor-section-tab-family').click();
  const disclosure = page.locator('[data-association-editor]');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(page.locator('[data-association-dates="a"]')).toBeHidden();
  await page.screenshot({ path: info.outputPath('historical-editor.png') });
  await disclosure.locator('summary').focus();
  await disclosure.locator('summary').press('Enter');
  await expect(page.locator('[data-association-dates="a"]')).toBeVisible();
  await expect(page.locator('[data-association-row="a"] select')).toHaveValue('enslaved');
  await page.locator('[data-association-dates="a"]').fill('1841, 1846, 1847');
  await page.locator('[data-association-dates="a"]').press('Tab');
  await disclosure.locator('summary').click();
  await disclosure.locator('summary').click();
  await expect(page.locator('[data-association-dates="a"]')).toHaveValue('1841, 1846, 1847');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.reload();
  await expect(page.locator('.archive-navigation')).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  expect(data.people.h.notes).toEqual(['Geänderte Beschreibung.']);
  expect(data.people.a.associations.h.documented).toEqual(['1841','1846','1847']);
  expect(data.people.a.associations.h.sources[0].url).toBe('/sources/test.pdf#page=1');
  expect(data.people.h.partners).toBeUndefined();expect(data.people.h.parents).toBeUndefined();
  await page.goto('/?person=h&action=edit'); await page.locator('#editor-section-tab-family').click();
  await expect(disclosure).not.toHaveAttribute('open');
  await disclosure.locator('summary').click();
  await page.locator('[data-remove-association="a"]').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=a&action=family');
  await expect(page.locator('[data-association]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="h"]')).toHaveCount(0);
});

test('historical links can be created in either direction and translated', async ({ page }) => {
  await load(page,fixture(),'admin');
  await page.goto('/?person=isolated&action=edit&language=en');
  await page.locator('#editor-section-tab-family').click();
  await expect(page.locator('[data-association-editor] summary')).toHaveText('Historical connections');
  await expect(page.locator('[data-association-editor]')).not.toHaveAttribute('open');
  await page.locator('[data-association-editor] summary').click();
  await page.locator('[data-association-editor] > label select').selectOption('enslaved');
  await page.locator('[data-add-association]').click();
  await page.locator('#pickerInput').fill('Person B');
  await page.getByRole('option').filter({hasText:'Person B'}).click();
  await page.locator('#personEditor button[type="submit"]').click();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  expect(data.people.b.associations.isolated.type).toBe('enslavement');
  expect(data.people.isolated.associations).toBeUndefined();
  await page.goto('/?person=isolated&action=person&language=pt');
  await expect(page.locator('[data-family-chip^="relAssociations:"]')).toContainText('Foi escravizado(a) por');
});

test('historical geometry also works in the layout worker', async ({ page }) => {
  const data=fixture();
  for(let i=0;i<80;i++) { const id=`child_${i}`; data.people[id]={name:`Child ${i}`,living:false,parents:['a']}; data.people.a.children!.push(id); }
  await load(page,data);
  await expect(page.locator('[data-family-person]')).toHaveCount(85);
  await sameRow(page,'a','h');
  await expect(page.locator('[data-association]')).toHaveCount(1);
});

test('person sources stay with their owner when navigating, removing and saving shared evidence', async ({ page }, info) => {
  const data = fixture();
  const shared = { label: 'Gemeinsamer Registerbeleg', url: '/sources/test.pdf#page=1' };
  const ownA = { label: 'Biografie von A', url: '/sources/test.pdf#page=2' };
  const ownH = { label: 'Biografie von H', url: '/sources/test.pdf#page=3' };
  data.people.a.sources = [ownA, shared];
  data.people.h.sources = [ownH, shared];
  data.people.a.associations!.h.sources = [shared];
  await load(page, data, 'admin');
  await page.goto('/?person=h&action=edit');
  await page.locator('#editor-section-tab-sources').click();
  await expect(page.locator('[data-remove-source]')).toHaveCount(2);
  await page.locator('[data-remove-source="1"]').click();
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=h&action=person');
  await page.locator('[data-info-sources] summary').click();
  await page.screenshot({ path: info.outputPath('source-ownership.png') });
  await expect(page.locator('[data-info-sources] a')).toHaveText(['Biografie von H']);
  await expect(page.locator('[data-info-relationship-sources]')).toContainText('Gemeinsamer Registerbeleg');
  await page.locator('[data-family-chip^="relAssociations:"] [data-info-person="a"]').click();
  await expect(page.locator('#family-person-title')).toHaveText('Person A');
  await page.locator('[data-info-sources] summary').click();
  await expect(page.locator('[data-info-sources] a')).toHaveText(['Biografie von A', 'Gemeinsamer Registerbeleg']);
  await page.goBack();
  await expect(page.locator('#family-person-title')).toHaveText('Person H');
  await page.reload();
  await expect(page.locator('#family-person-title')).toHaveText('Person H');
  await expect(page.locator('[data-info-sources] a')).toHaveText(['Biografie von H']);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('familyTreeDraft:demo')!));
  expect(draft.people.a.sources).toEqual([ownA, shared]);
  expect(draft.people.h.sources).toEqual([ownH]);
  expect(draft.people.a.associations.h.sources).toEqual([shared]);
});
