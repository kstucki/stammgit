<script lang="ts">
  import { directions, type Direction } from '../domain/graph-expansion';
  import { displayPersonName, type Person } from '../domain/person';
  import { formatLifeEvents } from '../domain/dates';
  import { sourceUrl } from '../data/family';
  let { id, person, center = false, assets, t, onopen, oncenter, marker, centerAction, hidden, onexpand }: {
    hidden: Record<Direction, string[]>; onexpand(direction: Direction): void; marker?: string; centerAction?: string; id: string; person: Person; center?: boolean; assets: ReadonlyMap<string, string>;
    t: { locale?: string; get(key: string, values?: Record<string, string | number>): string };
    onopen(id: string): void; oncenter(id: string): void;
  } = $props();
  let events = $derived(formatLifeEvents({ birth: person.birth, death: person.death }, t.locale));
</script>

<article class:central-person={center} class="family-person" data-family-person={id}>
  <button class="person-focus" onclick={() => oncenter(id)} aria-label={`${centerAction || t.get('familyMakeCenter')}: ${person.name || id}`}>
    {#if person.photo && sourceUrl(person.photo, assets)}
      <img src={sourceUrl(person.photo, assets)} alt="" class="person-photo" />
    {/if}
    <span class="person-card-text">
      <strong>{displayPersonName(person, id)}</strong>
      {#each events as event}
        <span class="person-years person-life-event">
          <span class="person-event-date">{event.prefix}{event.date ? ` ${event.date}` : ''}</span>
        </span>
      {/each}
    </span>
  </button>
  <button class="person-open" onclick={() => onopen(id)} aria-label={t.get('familyOpenPerson', { name: person.name || id })}>{t.get('personInfo')}{#if center}<span class="sr-only"> — {marker || t.get('familyCenter')}</span>{/if}</button>
  {#each directions as direction}
    {#if hidden[direction].length}
      <button class={`person-expand expand-${direction}`} data-expand={direction} onclick={() => onexpand(direction)} aria-label={t.get(`expand${direction}`, { name: person.name || id, count: hidden[direction].length })}>{direction === 'parents' ? '↑' : direction === 'children' ? '↓' : '↔'}</button>
    {/if}
  {/each}
</article>
