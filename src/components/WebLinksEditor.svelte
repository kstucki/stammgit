<script lang="ts">
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset } from '../domain/person';
  import { isWebUrl } from '../../public/assets/web-links.js';
  let { store, id, commit }: { store: Workspace; id: string; commit(operation?: (data: Dataset) => void): void } = $props();
  let label = $state(''), url = $state(''), error = $state('');
  function change(operation: (data: Dataset) => void) {
    try { commit(operation); error = ''; return true; }
    catch (err) { error = err instanceof Error ? err.message : String(err); return false; }
  }
  function add() {
    const target = url.trim();
    if (!isWebUrl(target)) { error = store.t.get('webLinkInvalid'); return; }
    if (change(data => {
      const person = data.people[id];
      person.links = [...(person.links || []).filter(link => link.url !== target), { label: label.trim() || target, url: target }];
    })) { label = ''; url = ''; }
  }
</script>
<section class="relation-box" data-web-links-editor>
  <h3>{store.t.get('webLinks')}</h3>
  <p>{store.t.get('webLinksHelp')}</p>
  <ul>{#each store.dataset.people[id].links || [] as link, i}<li>
    <a href={link.url} target="_blank" rel="noreferrer">{link.label || link.url}</a>
    <button type="button" data-remove-web-link={i} aria-label={store.t.get('webLinkRemove', { label: link.label || link.url })} onclick={() => change(data => {
      data.people[id].links!.splice(i, 1); if (!data.people[id].links!.length) delete data.people[id].links;
    })}>{store.t.get('webLinkRemoveButton')}</button>
  </li>{/each}</ul>
  <div class="toolbar">
    <input name="webLinkLabel" bind:value={label} aria-label={store.t.get('webLinkLabel')} placeholder={store.t.get('webLinkLabel')} />
    <input name="webLinkUrl" type="url" bind:value={url} aria-label={store.t.get('webLinkUrl')} placeholder="https://…" />
    <button type="button" data-add-web-link onclick={add}>{store.t.get('webLinkAdd')}</button>
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
