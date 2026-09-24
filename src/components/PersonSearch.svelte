<script lang="ts">
  import { findPeople, years } from '../domain/person';
  import type { Dataset } from '../domain/person';
  let { people, t, oncenter, onadd, inputId = 'family-search', label, exclude = [] }: {
    inputId?: string; label?: string; exclude?: string[]; people: Dataset['people']; t: { get(key: string, values?: Record<string, string | number>): string }; oncenter(id: string): void; onadd?(id: string): void;
  } = $props();
  let query = $state('');
  let matches = $derived(findPeople(people, query).filter(id => !exclude.includes(id)));
  function choose(id: string) { oncenter(id); query = ''; }
</script>

<div class="family-search">
  <label class="visually-hidden" for={inputId}>{label || t.get('familySearch')}</label>
  <input id={inputId} type="search" bind:value={query} placeholder={label || t.get('graphSearchPlaceholder')} autocomplete="off" aria-controls={`${inputId}-results`} />
  {#if query.trim()}
    <ul id={`${inputId}-results`} class="family-results" aria-label={t.get('familySearchResults')}>
      {#each matches as id}
        <li><button data-search-person={id} onclick={() => choose(id)}>{people[id].name || id} <span>{years(people[id], t.get('bornAbbr'))}</span></button>
          {#if onadd}<button class="add-root" aria-label={t.get('graphAddRoot', { name: people[id].name || id })} onclick={() => { onadd?.(id); query = ''; }}>+</button>{/if}</li>
      {:else}<li role="status">{t.get('familyNoResults')}</li>{/each}
    </ul>
  {/if}
</div>
