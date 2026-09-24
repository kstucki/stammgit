<script lang="ts">
  import type { Workspace } from '../state/workspace.svelte';
  import { sourceDocuments } from '../domain/sources';
  import { sourceUrl } from '../data/family';
  let { store, onperson }: { store: Workspace; onperson(id: string): void } = $props();
  let query = $state('');
  let entries = $derived(sourceDocuments(store.dataset.people));
  let shown = $derived(entries.filter(doc => [doc.label, doc.url, ...doc.persons.map(id => store.dataset.people[id].name || id)].some(text => text.toLowerCase().includes(query.trim().toLowerCase()))));
</script>
<section class="workspace" aria-busy={store.fileBusy > 0}>
  <h2>{store.t.get('sources')}</h2>
  <input id="sourcesSearch" type="search" bind:value={query} aria-label={store.t.get('sourcesSearchPlaceholder')} placeholder={store.t.get('sourcesSearchPlaceholder')} />
  {#if !shown.length}<p>{store.t.get('noHits')}</p>{/if}
  {#each shown as doc (doc.url)}
    <section class="card source-doc">
      <h3>{doc.label}</h3>
      <div class="toolbar"><a class="button-link" href={sourceUrl(doc.url, store.assets)} target="_blank" rel="noreferrer">{store.t.get('openDocument')}</a>
        {#if store.assets.has(doc.url)}<span>{store.t.get('sourcePendingTag')}</span>{/if}
        {#if store.admin}<button class="danger" data-delete-source={doc.url} onclick={() => store.deleteSource(doc.url).catch(error => alert(error.message))}>{store.t.get('delete')}</button>{/if}
      </div>
      <div class="toolbar">{#each doc.persons as id}<button class="chip" data-open-person={id} onclick={() => onperson(id)}>{store.dataset.people[id].name || id}</button>{/each}</div>
    </section>
  {/each}
</section>
