import { openSource } from './source-support';
import { expect } from '@playwright/test';
import { test, login } from './support';
async function language(page: import('@playwright/test').Page, code: string) {
  await page.locator('.archive-menu summary').click();
  await page.locator('[data-language-menu]').click();
  await page.locator(`[data-language="${code}"]`).click();
}
for (const role of ['reader','admin']) test(`English contents, relationships and persistence: ${role}`, async ({page}) => {
  await login(page,`fixture-${role}`);
  await page.route('**/data/trees/demo.json',route=>route.fulfill({json:{meta:{focusPersonId:'a'},people:{a:{name:'Ana',gender:'f',parents:['b']},b:{name:'Berta',gender:'f',children:['a'],occupation:'Lehrerin',occupation_en:'Teacher',notes:['Deutsche Notiz'],notes_en:['English biography.']}}}}));
  await page.evaluate(()=>sessionStorage.setItem('familyCenter:demo','a'));
  await page.goto('/?person=b&action=person&language=en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('[data-person-kinship]')).toHaveText('mother of Ana');
  await expect(page.locator('#personDialog')).toContainText('Teacher');
  await expect(page.locator('#personDialog')).toContainText('English biography.');
  await page.goto('/?view=family&action=connections&connect=a&connect=b&language=en');
  await expect(page.locator('[data-connection-description]')).toContainText('Berta is mother of Ana.');
  await language(page,'pt');
  await expect(page.locator('[data-connection-description]')).toContainText('Berta é mãe de Ana.');
  await language(page,'en'); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('English chronicle follows chapter position and source translation upload survives reload', async ({page})=>{
  await page.route('**/data/source-links.json',route=>route.fulfill({json:{'/sources/test.pdf':{demo:1}}}));
  await login(page); await page.goto('/?view=chronicle&chapter=intro.md&language=de');
  await language(page,'en');
  await expect(page).toHaveURL(/chapter=intro.en.md/);
  await expect(page.locator('a.chronicle-source')).toHaveAttribute('href','/sources/test.pdf');
  await expect(page.getByRole('heading',{name:'Test story',exact:true})).toBeVisible();
  await page.locator('.archive-menu summary').click(); await page.locator('[data-view="sources"]').click();
  await expect(page.locator('.archive-menu')).not.toHaveAttribute('open');
  const doc=await openSource(page);
  await doc.getByText('Manage document',{exact:true}).click();
  await doc.getByLabel('Upload translated PDF · English').setInputFiles({name:'translation.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% English fixture\n%%EOF')});
  await expect(doc.locator('a.button-link')).toHaveAttribute('href',/^blob:/);
  await page.reload(); await expect(doc.locator('a.button-link')).toHaveAttribute('href',/^blob:/);
  await expect(doc.getByRole('link',{name:'Original',exact:true})).toHaveAttribute('href','/sources/test.pdf');
  page.on('dialog',dialog=>dialog.accept());
  await doc.getByText('Manage document',{exact:true}).click();
  await doc.getByRole('button',{name:'Delete translation · English',exact:true}).click();
  await expect(doc.locator('a.button-link')).toHaveAttribute('href','/sources/test.pdf');
  await expect(doc.getByRole('link',{name:'English',exact:true})).toHaveCount(0);
});
