<script lang="ts">
  import SearchCombobox from './SearchCombobox.svelte';
  import { findPeople } from '../domain/person';
  import { formatLifespan } from '../domain/dates';
  import type { Dataset } from '../domain/person';
  let { people, t, oncenter, onadd, inputId = 'family-search', label, exclude = [] }: {
    inputId?: string; label?: string; exclude?: string[]; people: Dataset['people']; t: { locale?: string; get(key: string, values?: Record<string, string | number>): string }; oncenter(id: string): void; onadd?(id: string): void;
  } = $props();
  let query = $state('');
  let matches = $derived(findPeople(people, query).filter(id => !exclude.includes(id)));
</script>
<SearchCombobox {inputId} label={label || t.get('familySearch')} placeholder={label || t.get('graphSearchPlaceholder')}
  bind:query options={matches.map(id => ({ id, label: people[id].name || id, detail: formatLifespan(people[id], t.locale, 'card') }))}
  onchoose={oncenter} {onadd} addLabel={name => t.get('graphAddRoot', { name })} noResults={t.get('familyNoResults')} />
