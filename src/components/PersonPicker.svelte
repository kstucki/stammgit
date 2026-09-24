<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dataset } from '../domain/person';
  import { years } from '../domain/person';
  let { title, people, exclude = [], t, onpick }: { title: string; people: Dataset['people']; exclude?: string[]; t: { get(key: string): string }; onpick(id: string | null): void } = $props();
  let dialog: HTMLDialogElement, query = $state('');
  let matches = $derived(Object.keys(people).filter(id => !exclude.includes(id) && `${people[id].name || ''} ${id}`.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b, 'de')).slice(0, 60));
  onMount(() => dialog.showModal());
</script>
<dialog id="pickerDialog" class="workspace native-dialog" bind:this={dialog} onclose={() => onpick(null)} aria-labelledby="pickerTitle">
  <h3 id="pickerTitle">{title}</h3>
  <input id="pickerInput" type="search" bind:value={query} aria-label={t.get('searchPlaceholder')} placeholder={t.get('searchPlaceholder')} />
  <div id="pickerResults" class="picker-list">
    {#each matches as id}<button type="button" data-pick={id} onclick={() => onpick(id)}>{people[id].name || id} <span>{years(people[id], t.get('bornAbbr'))}</span></button>{/each}
    {#if !matches.length}<p>{t.get('noHits')}</p>{/if}
  </div>
  <button id="pickerCancel" onclick={() => onpick(null)}>{t.get('cancel')}</button>
</dialog>
