<script lang="ts">
  import YAML from 'yaml';
  import type { Workspace } from '../state/workspace.svelte';
  import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
  import { mergeImportedPeople } from '../../public/assets/model.js';
  import { personSources } from '../../public/assets/relationships.js';
  import { validateDataset } from '../../netlify/shared/validate.mjs';
  import { API, downloadText, downloadBlob } from '../data/sync';
  import { personId } from '../domain/sources';
  let { store }: { store: Workspace } = $props();
  let importFiles = $state<FileList>(), status = $state(''), zipBusy = $state(false);
  let t = $derived(store.t);
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
    const file = importFiles?.[0]; if (!file) { status = t.get('gedChooseFile'); return; }
    try {
      const parsed = importGedcom(await file.text()), n = Object.keys(parsed.people).length;
      if (!n) { status = t.get('gedNoPersons'); return; }
      const problems = validateDataset(parsed); if (problems.length) throw new Error(problems.join('\n'));
      if (!confirm(t.get('gedImportConfirm', { n, file: file.name, tree: store.tree }))) return;
      let duplicates: string[] = [];
      store.edit(data => { duplicates = mergeImportedPeople(data, parsed.people).duplicates.map((d: { name: string }) => d.name); });
      status = t.get('gedImported', { n }) + (duplicates.length ? t.get('gedDuplicates', { n: duplicates.length, names: duplicates.slice(0, 8).join(', ') + (duplicates.length > 8 ? ' …' : '') }) : '');
    } catch (error) { status = t.get('gedFailed', { err: error instanceof Error ? error.message : String(error) }); }
  }
  async function zip() {
    zipBusy = true;
    try { const response = await fetch(`${API}/download-sources`); if (!response.ok) throw new Error((await response.json()).error || String(response.status)); downloadBlob(`${store.tree}-sources.zip`, await response.blob()); }
    catch (error) { alert(t.get('zipFailed', { err: error instanceof Error ? error.message : String(error) })); }
    finally { zipBusy = false; }
  }
</script>
<section class="workspace" aria-busy={store.saving}>
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
  <section class="card"><h3>{t.get('importCard')}</h3><p>{t.get('importInfo')}</p><div class="toolbar"><input id="gedImportFile" type="file" accept=".ged,.gedcom" bind:files={importFiles} aria-label={t.get('importCard')} /><button id="gedImportBtn" onclick={importFile}>{t.get('importButton')}</button></div><p id="gedImportStatus" role="status">{status}</p></section>
  <section class="card"><h3>{t.get('downloadsCard')}</h3><p>{t.get('downloadsInfo', { n: Object.keys(store.dataset.people).length, m: new Set(Object.values(store.dataset.people).flatMap(p => personSources(p).map(s => s.url))).size, draft: store.draft ? t.get('downloadsDraftSuffix') : '' })}</p>
    <div class="toolbar"><button id="exportYaml" onclick={() => downloadText(`${store.tree}.yaml`, YAML.stringify(store.snapshot(), { lineWidth: 0 }), 'text/yaml')}>YAML</button><button id="exportJson" onclick={() => downloadText(`${store.tree}.json`, JSON.stringify(store.snapshot(), null, 2), 'application/json')}>JSON</button>
      <button id="exportGedcomBtn" onclick={() => { if (confirm(t.get('gedcomExportWarning'))) downloadText(`${store.tree}.ged`, exportGedcom(store.snapshot())); }}>GEDCOM</button>
      <button id="downloadSourcesZip" disabled={zipBusy} onclick={zip}>{t.get(zipBusy ? 'zipCreating' : 'downloadsZip')}</button></div>
  </section></fieldset>
</section>
