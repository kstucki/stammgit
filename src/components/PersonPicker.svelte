<script lang="ts">
  import SearchCombobox from './SearchCombobox.svelte';
  import { onMount } from 'svelte';
  import type { Dataset } from '../domain/person';
  import { formatLifespan } from '../domain/dates';
  let { title, people, exclude = [], t, onpick }: { title: string; people: Dataset['people']; exclude?: string[]; t: { locale?: string; get(key: string): string }; onpick(id: string | null): void } = $props();
  let dialog: HTMLDialogElement, query = $state('');
  let matches = $derived(Object.keys(people).filter(id => !exclude.includes(id) && `${people[id].name || ''} ${id}`.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b, 'de')).slice(0, 60));
  onMount(() => dialog.showModal());
</script>
<dialog id="pickerDialog" class="workspace native-dialog" bind:this={dialog} onclose={() => onpick(null)} aria-labelledby="pickerTitle">
  <h3 id="pickerTitle">{title}</h3>
  <div class="picker-list"><SearchCombobox inputId="pickerInput" label={t.get('searchPlaceholder')} bind:query
    options={matches.map(id => ({ id, label: people[id].name || id, detail: formatLifespan(people[id], t.locale, 'card') }))}
    onchoose={onpick} noResults={t.get('noHits')} showEmpty /></div>
  <button id="pickerCancel" onclick={() => onpick(null)}>{t.get('cancel')}</button>
</dialog>
