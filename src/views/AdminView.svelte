<script lang="ts">
  import { untrack } from 'svelte';
  import ChronicleBookExport from '../components/ChronicleBookExport.svelte';
  import YAML from 'yaml';
  import type { Workspace } from '../state/workspace.svelte';
  import { mergeImportedPeople } from '../../public/assets/model.js';
  import { sourceDocuments } from '../domain/sources';
  import { validateDataset } from '../../netlify/shared/validate.mjs';
  import { API, downloadText, downloadBlob } from '../data/sync';
  import { personId } from '../domain/sources';
  import type { Dataset } from '../domain/person';
  import type { GedcomLanguage } from '../data/gedzip';
  let { store, language = 'de' }: { store: Workspace; language?: string } = $props();
  let importFiles = $state<FileList>(), status = $state(''), zipBusy = $state(false), importBusy = $state(false);
  let living551 = $state(true), living7 = $state(true), gedProgress = $state('');
  let gedLanguage = $state<GedcomLanguage>(untrack(() => store.language) as GedcomLanguage);
  const languageNames: Record<string, string> = { de: 'Deutsch', en: 'English', pt: 'Português' };
  let languageOptions = $derived([store.language, ...['de', 'en', 'pt'].filter(code => code !== store.language)]);
  let t = $derived(store.t);
  let bookBusy = $state(false), bookError = $state('');
  let bookPrinter = $state<{ printBook(): Promise<void> }>();
  let bookAvailable = $derived((language === store.chronicle?.language ? store.chronicle : store.chronicle?.variants?.[language])?.chapters.length);
  const draftCount = (id: string) => { try { return Object.keys(JSON.parse(localStorage.getItem(`familyTreeDraft:${id}`) || 'null')?.people || {}).length || null; } catch { return null; } };
  let localTrees = $derived(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) || '').filter(key => key.startsWith('familyTreeDraft:')).map(key => key.slice(16)).filter(id => !store.index.trees.some(tree => tree.id === id)).sort());
  function createTree() {
    const name = prompt(t.get('newTreePrompt')); if (!name) return;
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return alert(t.get('invalidName'));
    if (store.index.trees.some(tree => tree.id === slug) || localStorage.getItem(`familyTreeDraft:${slug}`)) return alert(t.get('treeExists', { slug }));
    const first = prompt(t.get('firstPersonPrompt'), t.get('firstPersonDefault')); if (!first) return;
    const id = personId(first);
    localStorage.setItem(`familyTreeDraft:${slug}`, JSON.stringify({ meta: { title: name, focusPersonId: id }, people: { [id]: { name: first } } }));
    localStorage.setItem('activeTree', slug); location.reload();
  }
  async function importFile() {
    if (importBusy) return;
    const file = importFiles?.[0]; if (!file) { status = t.get('gedChooseFile'); return; }
    importBusy = true;
    try {
      const packaged = /\.(gdz|zip)$/i.test(file.name);
      // The ZIP library loads only when a package is used.
      const { parsed, media } = packaged ? await (await import('../data/gedzip')).readGedzip(file) : { parsed: (await import('../../public/assets/gedcom.js')).importGedcom(await file.text()), media: [] };
      const n = Object.keys(parsed.people).length;
      if (!n) { status = t.get('gedNoPersons'); return; }
      const problems = validateDataset(parsed); if (problems.length) throw new Error(problems.join('\n'));
      if (!confirm(t.get('gedImportConfirm', { n, file: file.name, tree: store.tree }))) return;
      const fresh = media.length ? await (await import('../data/gedzip')).newGedzipMedia(media, store.assets) : [];
      const merged = store.snapshot();
      const duplicates = mergeImportedPeople(merged, parsed.people).duplicates.map((d: { name: string }) => d.name);
      const categories = parsed.sourceCategories as Dataset['sourceCategories'];
      if (categories) merged.sourceCategories = { ...categories, ...(merged.sourceCategories || {}) };
      if (parsed.sourceDetails) merged.sourceDetails = { ...parsed.sourceDetails, ...(merged.sourceDetails || {}) };
      const mergedProblems = validateDataset(merged);
      if (mergedProblems.length) throw new Error(mergedProblems.join('\n'));
      for (const item of fresh) await store.stageFile(item.path.startsWith('photos/') ? item.path : item.path.replace(/^sources\//, ''), item.blob);
      store.edit(data => Object.assign(data, merged));
      status = t.get('gedImported', { n }) + (fresh.length ? ' ' + t.get('gedImportedFiles', { n: fresh.length }) : '') + (duplicates.length ? t.get('gedDuplicates', { n: duplicates.length, names: duplicates.slice(0, 8).join(', ') + (duplicates.length > 8 ? ' …' : '') }) : '');
    } catch (error) {
      const err = error instanceof Error && 'fileError' in error && 'path' in error
        ? t.get(`gedFile${error.fileError}`, { file: String(error.path) })
        : error instanceof Error ? error.message : String(error);
      status = t.get('gedFailed', { err });
    }
    finally { importBusy = false; }
  }
  async function export551() {
    if (!confirm(t.get('gedcomExportWarning'))) return;
    const { exportGedcom } = await import('../../public/assets/gedcom.js');
    downloadText(`${store.tree}.ged`, exportGedcom(store.snapshot(), store.language, { includeLiving: living551 }));
  }
  async function export7() {
    if (gedProgress) return;
    const exportLanguage = gedLanguage, tree = store.tree, data = store.snapshot();
    gedProgress = t.get('gedcom7Progress', { done: 0, total: '…' });
    try {
      const { buildGedzip } = await import('../data/gedzip');
      const blob = await buildGedzip(data, { language: exportLanguage, includeLiving: living7, sourceFiles: store.sourceFiles, assets: store.assets },
        (done, total) => { gedProgress = t.get('gedcom7Progress', { done, total }); });
      downloadBlob(`${tree}-gedcom7-${exportLanguage}.gdz`, blob);
    } catch (error) { alert(t.get('gedcom7Failed', { err: error instanceof Error ? error.message : String(error) })); }
    finally { gedProgress = ''; }
  }
  async function zip() {
    zipBusy = true;
    try { const response = await fetch(`${API}/download-sources`); if (!response.ok) throw new Error((await response.json()).error || String(response.status)); downloadBlob(`${store.tree}-sources.zip`, await response.blob()); }
    catch (error) { alert(t.get('zipFailed', { err: error instanceof Error ? error.message : String(error) })); }
    finally { zipBusy = false; }
  }
</script>
<section class="workspace admin-workspace" aria-busy={store.saving}>
  <h2>{t.get('adminTitle')}</h2>{#if store.legacyPending}<p role="alert">{t.get('legacyPendingUnassigned')}</p>{/if}<p>{t.get('adminSubtitle')}</p>
  <section class="card"><h3>{t.get('draftCard')}</h3><p>{t.get(store.draft ? 'draftActive' : 'draftNone')}</p>
    {#if store.files.length || store.deletions.length}<p>{t.get('pendingInfo', { u: store.files.length, d: store.deletions.length })}</p>{/if}
    <div class="toolbar"><button id="adminSync" disabled={!store.pending || store.saving} onclick={() => store.sync()}>{store.progress || t.get('syncButton')}</button>
      <button id="adminDiscard" disabled={!store.pending || store.saving} onclick={() => store.discard().catch(error => alert(error.message))}>{t.get('discardButton')}</button></div>
  </section>
  <fieldset disabled={store.saving}><section class="card"><h3>{t.get('datasetCard')}</h3><p>{t.get('datasetInfo', { tree: store.tree, n: Object.keys(store.dataset.people).length, def: store.index.defaultTree })}</p>
    {#if store.isNew}<p>{t.get('datasetLocal')}</p>{/if}
    <div class="toolbar"><select id="treeSelect" aria-label={t.get('datasetCard')} value={store.tree} onchange={event => { localStorage.setItem('activeTree', event.currentTarget.value); location.reload(); }}>
      {#each store.index.trees as tree}<option value={tree.id}>{t.get('datasetPersons', { id: tree.id, n: draftCount(tree.id) ?? tree.people })}</option>{/each}
      {#each localTrees as id}<option value={id}>{t.get('datasetNewLocal', { id, n: draftCount(id) ?? 0 })}</option>{/each}
    </select><button id="treeCreate" onclick={createTree}>{t.get('datasetNew')}</button></div>
  </section>
  <section class="card"><h3>{t.get('importCard')}</h3><p>{t.get('importInfo')}</p><div class="toolbar"><input id="gedImportFile" disabled={importBusy} type="file" accept=".ged,.gedcom,.gdz,.zip" bind:files={importFiles} aria-label={t.get('importCard')} /><button id="gedImportBtn" disabled={importBusy} onclick={importFile}>{t.get('importButton')}</button></div><p id="gedImportStatus" role="status">{status}</p></section>
  <section class="card"><h3>{t.get('downloadsCard')}</h3><p>{t.get('downloadsInfo', { n: Object.keys(store.dataset.people).length, m: sourceDocuments(store.dataset.people, store.sourceFiles, store.dataset.sourceDetails).length, draft: store.draft ? t.get('downloadsDraftSuffix') : '' })}</p>
    <div class="toolbar"><button id="exportYaml" onclick={() => downloadText(`${store.tree}.yaml`, YAML.stringify(store.snapshot(), { lineWidth: 0 }), 'text/yaml')}>YAML</button><button id="exportJson" onclick={() => downloadText(`${store.tree}.json`, JSON.stringify(store.snapshot(), null, 2), 'application/json')}>JSON</button>
      <button id="downloadSourcesZip" disabled={zipBusy} onclick={zip}>{t.get(zipBusy ? 'zipCreating' : 'downloadsZip')}</button></div>
    <h4>GEDCOM</h4><p>{t.get('gedcomInfo')}</p>
    <div class="toolbar gedcom-export"><button id="exportGedcomBtn" onclick={export551}>GEDCOM 5.5.1</button>
      <label class="editor-check"><input id="gedLiving551" type="checkbox" bind:checked={living551} /> {t.get('gedcomIncludeLiving')}</label></div>
    <div class="toolbar gedcom-export"><button id="exportGedcom7Btn" disabled={!!gedProgress} onclick={export7}>{gedProgress || 'GEDCOM 7 (GEDZIP)'}</button>
      <select id="gedLanguage" disabled={!!gedProgress} aria-label={t.get('gedcomLanguage')} bind:value={gedLanguage}>
        {#each languageOptions as code (code)}<option value={code}>{languageNames[code]}</option>{/each}
      </select>
      <label class="editor-check"><input id="gedLiving7" disabled={!!gedProgress} type="checkbox" bind:checked={living7} /> {t.get('gedcomIncludeLiving')}</label></div>
    {#if store.chronicle}<div class="toolbar book-export-controls">
      <button data-print-book disabled={bookBusy || !bookAvailable} onclick={() => bookPrinter?.printBook()}>{t.get(bookBusy ? 'bookPreparing' : 'bookPrint')}</button>
    </div>{#if bookError}<p role="alert">{bookError}</p>{/if}{/if}
  </section></fieldset>
</section>

{#if store.admin && store.chronicle}<ChronicleBookExport bind:this={bookPrinter} {store} language={language} bind:busy={bookBusy} bind:error={bookError} />{/if}
