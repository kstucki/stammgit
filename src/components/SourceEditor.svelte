<script lang="ts">
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset } from '../domain/person';
  import { sourceDocuments, sourceCategories, setSourceCategory } from '../domain/sources';
  import type { SourceCategory } from '../domain/person';
  import { pendingFileNames } from '../../public/assets/pending.js';
  import { sourceBase } from '../domain/source-language';
  let { store, id, commit }: { store: Workspace; id: string; commit(operation?: (data: Dataset) => void): void } = $props();
  let category = $state<SourceCategory>('andere'), existing = $state(''), url = $state(''), urlLabel = $state(''), label = $state(''), files = $state<FileList>(), status = $state(''), busy = $state(false);
  let docs = $derived(sourceDocuments(store.dataset.people, store.sourceFiles, store.dataset.sourceDetails));
  function change(operation: (data: Dataset) => void) { try { commit(operation); return true; } catch (error) { status = error instanceof Error ? error.message : String(error); return false; } }
  // A category is only set for newly created documents; linking keeps the document's existing category.
  const add = (url: string, label: string, newCategory?: SourceCategory) => change(data => {
    const p = data.people[id]; p.sources = [...(p.sources || []).filter(s => s.url !== url), { label, url }];
    if (newCategory) setSourceCategory(data, url, newCategory);
  });
  const isKnown = (url: string) => docs.some(doc => doc.url === sourceBase(url).replace(/#.*$/, ''));
  function addUrl() {
    if (!url.trim() || !urlLabel.trim()) { status = store.t.get('srcNeedBoth'); return; }
    if (!/^https?:\/\//i.test(url)) { status = store.t.get('srcBadUrl'); return; }
    if (add(url.trim(), urlLabel.trim(), isKnown(url.trim()) ? undefined : category)) { url = ''; urlLabel = ''; category = 'andere'; status = store.t.get('srcUrlAdded'); }
  }
  async function upload() {
    const file = files?.[0];
    if (!label.trim() || !file) { status = store.t.get('srcNeedBoth'); return; }
    if (file.size > 4 * 1024 * 1024) { status = store.t.get('srcTooBig'); return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { status = store.t.get('srcBadType'); return; }
    busy = true;
    try {
      const base = file.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
      let name = base, n = 2; const taken = new Set([...docs.map(d => d.url.replace('/sources/', '')), ...Object.keys(store.sourceLinks).map(url => url.replace('/sources/', '')), ...Array.from(store.sourceFiles, url => url.replace('/sources/', '')), ...await pendingFileNames()]);
      const translation = /\.(pt|en)\.pdf$/.test(base);
      if (translation && !taken.has(base.replace(/\.(pt|en)\.pdf$/, '.pdf'))) throw new Error(store.t.get('sourceTranslationOriginal'));
      if (translation && taken.has(name) && !confirm(store.t.get('sourceReplaceTranslation'))) return;
      while (!translation && taken.has(name)) name = base.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
      const canonical = sourceBase(`/sources/${name}`);
      // Staging adds the file to docs, so decide whether it is new beforehand.
      const newCategory = translation || isKnown(canonical) ? undefined : category;
      await store.stageFile(name, file);
      if (!(store.dataset.people[id].sources || []).some(s => sourceBase(s.url) === canonical)
        && !add(canonical, label.trim(), newCategory)) return;
      if (!translation) category = 'andere';
      status = store.t.get('srcStoredLocally');
    } catch (error) { status = String(error instanceof Error ? error.message : error); }
    finally { busy = false; }
  }
</script>
<section class="relation-box"><h3>{store.t.get('sources')}</h3>
  <ul>{#each store.dataset.people[id].sources || [] as source, i}<li><a href={store.sourceHref(source.url)} target="_blank" rel="noreferrer">{source.label || source.url}</a>
    <button type="button" data-remove-source={i} onclick={() => change(data => { data.people[id].sources!.splice(i, 1); if (!data.people[id].sources!.length) delete data.people[id].sources; })}>{store.t.get('removeSourceTitle')}</button></li>{/each}</ul>
  <div class="toolbar"><select id="srcExisting" bind:value={existing} aria-label={store.t.get('sources')}><option value="">{store.t.get('none')}</option>{#each docs as doc}<option value={doc.url}>{doc.label}</option>{/each}</select><button type="button" id="srcLinkExisting" disabled={!existing || busy} onclick={() => { const doc = docs.find(d => d.url === existing); if (doc) add(doc.url, doc.label); }}>{store.t.get('srcLink')}</button></div>
  <div class="toolbar"><label for="srcCategory">{store.t.get('sourceCategoryNew')}</label><select id="srcCategory" bind:value={category}>{#each sourceCategories as option (option)}<option value={option}>{store.t.get(`sourceCategory_${option}`)}</option>{/each}</select></div>
  <div class="toolbar"><input id="srcLabel" bind:value={label} aria-label={store.t.get('srcLabelPlaceholder')} placeholder={store.t.get('srcLabelPlaceholder')} /><input id="srcFile" type="file" accept=".pdf,.png,.jpg,.jpeg" bind:files={files} aria-label={store.t.get('srcUploadButton')} /><button type="button" id="srcUpload" disabled={busy} onclick={upload}>{store.t.get('srcUploadButton')}</button></div>
  <div class="toolbar"><input id="srcUrlLabel" bind:value={urlLabel} aria-label={store.t.get('srcUrlLabelPlaceholder')} placeholder={store.t.get('srcUrlLabelPlaceholder')} /><input id="srcUrl" type="url" bind:value={url} aria-label="URL" placeholder="https://…" /><button type="button" id="srcAddUrl" onclick={addUrl}>{store.t.get('srcAddUrl')}</button></div>
  <p id="srcStatus" role="status">{status}</p>
</section>
