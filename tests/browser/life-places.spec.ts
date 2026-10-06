import { expect } from '@playwright/test';
import { test, login } from './support';
test('places and occupation appear only in info; cards show dates only', async ({ page }) => {
  await login(page, 'fixture-reader');
  const longPlace = 'Basel, ein sehr langer historischer Ortsname ohne automatische Kürzung';
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    Object.assign(data.people.person_a, { birth: '1960-05-02', birthPlace: longPlace, death: '2020', deathPlace: 'Ittigen', occupation: 'Lehrer', occupation_pt: 'Professor' });
    delete data.people.person_b.birth; delete data.people.person_b.death;
    data.people.person_b.birthPlace = 'Belp';
    await route.fulfill({ json: data });
  });
  for (const language of ['de', 'pt', 'en']) {
    await page.goto('/?view=family&person=person_a&language=' + language);
    const card = page.locator('[data-family-person="person_a"]');
    await expect(card.locator('.person-life-event')).toHaveCount(2);
    await expect(card).toContainText('* 1960');
    await expect(card).toContainText('† 2020');
    await expect(card).not.toContainText('Lehrer');
    await expect(card).not.toContainText('Professor');
    await expect(card).not.toContainText(longPlace);
    await expect(card).not.toContainText('Ittigen');
    await expect(card.locator('.person-event-place')).toHaveCount(0);
    await expect(page.locator('[data-family-person="person_b"] .person-years')).toHaveCount(0);
    await card.locator('.person-open').click();
    await expect(page.locator('.person-info-life')).toContainText(longPlace);
    await expect(page.locator('.person-info-life')).toContainText('Ittigen');
    await expect(page.locator('.person-info-occupation')).toContainText(language === 'pt' ? 'Professor' : 'Lehrer');
    await expect(page.locator('.person-info-life')).toContainText(language === 'de' ? '2.5.1960' : language === 'pt' ? '2 de maio de 1960' : '2 May 1960');
  }
});
test('editor saves and removes places without losing occupation', async ({ page }) => {
  await login(page);
  await page.goto('/?person=person_a&action=edit');
  await page.locator('[name="birthPlace"]').fill('Belp');
  await page.locator('[name="deathPlace"]').fill('Ittigen');
  await page.locator('[name="occupation"]').fill('Lehrer');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=edit');
  await expect(page.locator('[name="birthPlace"]')).toHaveValue('Belp');
  await expect(page.locator('[name="deathPlace"]')).toHaveValue('Ittigen');
  await expect(page.locator('[name="occupation"]')).toHaveValue('Lehrer');
  await page.locator('[name="deathPlace"]').fill('');
  await page.locator('#personEditor button[type="submit"]').click();
  await page.goto('/?person=person_a&action=person');
  await expect(page.locator('.person-info-life')).toContainText('Belp');
  await expect(page.locator('.person-info-life')).not.toContainText('Ittigen');
});


test('compact person header handles missing life data and keeps occupation separate', async ({ page }, info) => {
  await login(page, 'fixture-reader');
  let fields: Record<string, string> = {};
  await page.route('**/data/trees/demo.json', async route => {
    const data = await (await route.fetch()).json();
    for (const key of ['birth', 'death', 'birthPlace', 'deathPlace', 'occupation', 'occupation_pt']) delete data.people.person_a[key];
    Object.assign(data.people.person_a, fields);
    await route.fulfill({ json: data });
  });
  for (const language of ['de', 'pt', 'en']) {
    fields = { birth: '1926-05-02', birthPlace: 'Basel', death: '2025-09-05', deathPlace: 'Ittigen', occupation: 'Dr. iur. in Wädenswil', occupation_pt: 'Doutor em Direito em Wädenswil' };
    await page.goto('/?view=family&person=person_a&info=person_a&language=' + language);
    const head = page.locator('.person-info-heading');
    const dates = language === 'de' ? ['2.5.1926', '5.9.2025'] : language === 'pt' ? ['2 de maio de 1926', '5 de setembro de 2025'] : ['2 May 1926', '5 Sep 2025'];
    const preposition = language === 'pt' ? 'em' : 'in';
    await expect(head.locator('.person-info-life p')).toHaveText([`* ${dates[0]} ${preposition} Basel`, `† ${dates[1]} ${preposition} Ittigen`]);
    await expect(head.locator('.person-info-occupation')).toHaveText(fields[language === 'pt' ? 'occupation_pt' : 'occupation']);
    await expect(page.locator('.person-life-places')).toHaveCount(0);
    const rows = await head.locator('.person-info-life p').all();
    expect((await rows[1].boundingBox())!.y).toBeGreaterThan((await rows[0].boundingBox())!.y);
    const occupation = await head.locator('.person-info-occupation').boundingBox();
    expect(occupation!.y).toBeGreaterThan((await rows[1].boundingBox())!.y);
    await page.screenshot({ path: info.outputPath(`person-header-${language}.png`) });
  }
  for (const [values, expected] of [
    [{ birth: '1960' }, ['* 1960']],
    [{ death: '2020' }, ['† 2020']],
    [{ birthPlace: 'Basel', deathPlace: 'Ittigen' }, ['* in Basel', '† in Ittigen']],
    [{ occupation: 'Lehrerin' }, []],
    [{}, []],
  ] as [Record<string, string>, string[]][]) {
    fields = values;
    await page.goto('/?view=family&person=person_a&info=person_a&language=de');
    await expect(page.locator('#personDialog')).toBeVisible();
    await expect(page.locator('.person-info-life p')).toHaveText(expected);
    await expect(page.locator('.person-info-occupation')).toHaveCount(values.occupation ? 1 : 0);
  }
});
