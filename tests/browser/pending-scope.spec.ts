import { expect } from '@playwright/test';
import { test, login } from './support';

test('sync and discard touch only the active dataset pending files and deletions', async ({ page }) => {
  await login(page);
  await page.evaluate(async () => {
    const path = '/assets/pending.js', p = await import(path);
    await p.pendingPutFile('scope-demo.pdf', new Blob(['%PDF-1.4 demo']), 'demo');
    await p.pendingPutFile('scope-complex.pdf', new Blob(['%PDF-1.4 other']), 'complex');
    await p.pendingQueueDeletion('missing-complex.pdf', 'complex');
  });
  await page.goto('/?view=admin');
  page.once('dialog', dialog => dialog.accept());
  const saved = page.waitForResponse(r => r.url().endsWith('/save-family'));
  await page.locator('#adminSync').click(); expect((await saved).status()).toBe(200);
  await expect(page.locator('#adminSync')).toBeDisabled();
  expect((await page.request.get('/sources/scope-demo.pdf')).status()).toBe(200);
  expect((await page.request.get('/sources/scope-complex.pdf')).status()).toBe(404);
  const other = await page.evaluate(async () => {
    const path = '/assets/pending.js', p = await import(path);
    await p.pendingPutFile('discard-demo.pdf', new Blob(['draft']), 'demo');
    return { files: await p.pendingListFiles('complex'), deletions: await p.pendingListDeletions('complex') };
  });
  expect(other).toEqual({ files: ['scope-complex.pdf'], deletions: ['missing-complex.pdf'] });
  await page.reload(); page.once('dialog', dialog => dialog.accept());
  await page.locator('#adminDiscard').click();
  await expect(page.locator('#adminDiscard')).toBeDisabled();
  expect(await page.evaluate(async () => {
    const path = '/assets/pending.js', p = await import(path);
    return { current: await p.pendingListFiles('demo'), other: await p.pendingListFiles('complex'), deletions: await p.pendingListDeletions('complex') };
  })).toEqual({ current: [], other: ['scope-complex.pdf'], deletions: ['missing-complex.pdf'] });
});

test('legacy pending migration preserves ambiguous records and never overwrites newer bytes', async ({ page }) => {
  await login(page);
  const result = await page.evaluate(async () => {
    const path = '/assets/pending.js', p = await import(path);
    await p.pendingPutFile('shared.pdf', new Blob(['old']));
    await p.pendingPutFile('shared.pdf', new Blob(['new']), 'demo');
    await p.pendingPutFile('chronicle/complex/intro.md', new Blob(['other language']));
    await p.pendingQueueDeletion('old.pdf');
    const ambiguous = await p.migrateLegacyPending('demo', false);
    const legacy = await p.pendingListFiles();
    await p.migrateLegacyPending('complex', false);
    const adopted = await new Blob([(await p.pendingGetFile('chronicle/complex/intro.md', 'complex')).blob]).text();
    const conflict = await p.migrateLegacyPending('demo', true);
    const newer = await new Blob([(await p.pendingGetFile('shared.pdf', 'demo')).blob]).text();
    return { ambiguous, legacy, adopted, conflict, newer, oldPreserved: !!await p.pendingGetFile('shared.pdf'), deletions: await p.pendingListDeletions('demo') };
  });
  expect(result).toEqual({ ambiguous: true, legacy: ['chronicle/complex/intro.md', 'shared.pdf'], adopted: 'other language', conflict: true, newer: 'new', oldPreserved: true, deletions: ['old.pdf'] });
});
