<script lang="ts">
  import { directions, type Direction } from '../domain/graph-expansion';
  import type { Person } from '../domain/person';
  import { years } from '../domain/person';
  import { sourceUrl } from '../data/family';
  let { id, person, center = false, assets, t, onopen, oncenter, marker, centerAction, hidden, onexpand }: {
    hidden: Record<Direction, string[]>; onexpand(direction: Direction): void; marker?: string; centerAction?: string; id: string; person: Person; center?: boolean; assets: ReadonlyMap<string, string>;
    t: { get(key: string, values?: Record<string, string | number>): string };
    onopen(id: string): void; oncenter(id: string): void;
  } = $props();
</script>

<article class:central-person={center} class="family-person" data-family-person={id}>
  <button class="person-focus" onclick={() => oncenter(id)} aria-label={`${centerAction || t.get('familyMakeCenter')}: ${person.name || id}`}>
    {#if person.photo && sourceUrl(person.photo, assets)}
      <img src={sourceUrl(person.photo, assets)} alt="" class="person-photo" />
    {/if}
    <span class="person-card-text">
      <strong>{person.name || id}</strong>
      <span class="person-years">{years(person, t.get('bornAbbr'))}</span>
      {#if person.occupation}<span class="person-occupation">{person.occupation}</span>{/if}
    </span>
  </button>
  <button class="person-open" onclick={() => onopen(id)} aria-label={t.get('familyOpenPerson', { name: person.name || id })}>{t.get('personInfo')}{#if center}<span class="sr-only"> — {marker || t.get('familyCenter')}</span>{/if}</button>
  {#each directions as direction}
    {#if hidden[direction].length}
      <button class={`person-expand expand-${direction}`} data-expand={direction} onclick={() => onexpand(direction)} aria-label={t.get(`expand${direction}`, { name: person.name || id, count: hidden[direction].length })}>{direction === 'parents' ? '↑' : direction === 'children' ? '↓' : '↔'}</button>
    {/if}
  {/each}
</article>
