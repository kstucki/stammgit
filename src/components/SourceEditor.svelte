<script lang="ts">
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset } from '../domain/person';
  import { sourceDocuments } from '../domain/sources';
  import { pendingFileNames } from '../../public/assets/pending.js';
  import { sourceUrl } from '../data/family';
  let { store, id, commit }: { store: Workspace; id: string; commit(operation?: (data: Dataset) => void): void } = $props();
  let existing = $state(''), url = $state(''), urlLabel = $state(''), label = $state(''), files = $state<FileList>(), status = $state(''), busy = $state(false);
  let docs = $derived(sourceDocuments(store.dataset.people));
  function change(operation: (data: Dataset) => void) { try { commit(operation); return true; } catch (error) { status = error instanceof Error ? error.message : String(error); return false; } }
  const add = (url: string, label: string) => change(data => { const p = data.people[id]; p.sources = [...(p.sources || []).filter(s => s.url !== url), { label, url }]; });
  function addUrl() {
    if (!url.trim() || !urlLabel.trim()) { status = store.t.get('srcNeedBoth'); return; }
    if (!/^https?:\/\//i.test(url)) { status = store.t.get('srcBadUrl'); return; }
    if (add(url.trim(), urlLabel.trim())) { url = ''; urlLabel = ''; status = store.t.get('srcUrlAdded'); }
  }
  async function upload() {
    const file = files?.[0];
    if (!label.trim() || !file) { status = store.t.get('srcNeedBoth'); return; }
    if (file.size > 4 * 1024 * 1024) { status = store.t.get('srcTooBig'); return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { status = store.t.get('srcBadType'); return; }
    busy = true;
    try {
      const base = file.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
      let name = base, n = 2; const taken = new Set([...docs.map(d => d.url.replace('/sources/', '')), ...Object.keys(store.sourceLinks).map(url => url.replace('/sources/', '')), ...await pendingFileNames()]);
      while (taken.has(name)) name = base.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
      await store.stageFile(name, file); add(`/sources/${name}`, label.trim()); status = store.t.get('srcStoredLocally');
    } catch (error) { status = String(error instanceof Error ? error.message : error); }
    finally { busy = false; }
  }
</script>
<section class="relation-box"><h3>{store.t.get('sources')}</h3>
  <ul>{#each store.dataset.people[id].sources || [] as source, i}<li><a href={sourceUrl(source.url, store.assets)} target="_blank" rel="noreferrer">{source.label || source.url}</a>
    <button type="button" data-remove-source={i} onclick={() => change(data => { data.people[id].sources!.splice(i, 1); if (!data.people[id].sources!.length) delete data.people[id].sources; })}>{store.t.get('removeSourceTitle')}</button></li>{/each}</ul>
  <div class="toolbar"><select id="srcExisting" bind:value={existing} aria-label={store.t.get('sources')}><option value="">{store.t.get('none')}</option>{#each docs as doc}<option value={doc.url}>{doc.label}</option>{/each}</select><button type="button" id="srcLinkExisting" disabled={!existing || busy} onclick={() => { const doc = docs.find(d => d.url === existing); if (doc) add(doc.url, doc.label); }}>{store.t.get('srcLink')}</button></div>
  <div class="toolbar"><input id="srcLabel" bind:value={label} aria-label={store.t.get('srcLabelPlaceholder')} placeholder={store.t.get('srcLabelPlaceholder')} /><input id="srcFile" type="file" accept=".pdf,.png,.jpg,.jpeg" bind:files={files} aria-label={store.t.get('srcUploadButton')} /><button type="button" id="srcUpload" disabled={busy} onclick={upload}>{store.t.get('srcUploadButton')}</button></div>
  <div class="toolbar"><input id="srcUrlLabel" bind:value={urlLabel} aria-label={store.t.get('srcUrlLabelPlaceholder')} placeholder={store.t.get('srcUrlLabelPlaceholder')} /><input id="srcUrl" type="url" bind:value={url} aria-label="URL" placeholder="https://…" /><button type="button" id="srcAddUrl" onclick={addUrl}>{store.t.get('srcAddUrl')}</button></div>
  <p id="srcStatus" role="status">{status}</p>
</section>
