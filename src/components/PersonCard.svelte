<script lang="ts">
  import type { Person } from '../domain/person';
  import { years } from '../domain/person';
  import { sourceUrl } from '../data/family';
  let { id, person, center = false, assets, t, onopen, oncenter, marker, centerAction }: {
    marker?: string; centerAction?: string; id: string; person: Person; center?: boolean; assets: ReadonlyMap<string, string>;
    t: { get(key: string, values?: Record<string, string | number>): string };
    onopen(id: string): void; oncenter(id: string): void;
  } = $props();
</script>

<article class:central-person={center} class="family-person" data-family-person={id}>
  <button class="person-open" onclick={() => onopen(id)} aria-label={t.get('familyOpenPerson', { name: person.name || id })}>
    {#if person.photo && sourceUrl(person.photo, assets)}
      <img src={sourceUrl(person.photo, assets)} alt="" class="person-photo" />
    {/if}
    <span class="person-card-text">
      <strong>{person.name || id}</strong>
      <span class="person-years">{years(person, t.get('bornAbbr'))}</span>
      {#if person.occupation}<span class="person-occupation">{person.occupation}</span>{/if}
    </span>
  </button>
  {#if center}<span class="center-marker">{marker || t.get('familyCenter')}</span>
  {:else}<button class="person-center" onclick={() => oncenter(id)}>{centerAction || t.get('familyMakeCenter')}</button>{/if}
</article>
