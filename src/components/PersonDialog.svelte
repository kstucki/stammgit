<script lang="ts">
  import PersonSearch from './PersonSearch.svelte';
  import { onMount } from 'svelte';
  import { chapterHref, personHref } from '../domain/person';
  import type { Dataset, ChronicleIndex, Source } from '../domain/person';
  import { sourceUrl } from '../data/family';
  let { id, dataset, assets, chronicle, admin, t, relations, onopen, onclose }: {
    id: string; dataset: Dataset; assets: ReadonlyMap<string, string>; chronicle: ChronicleIndex | null;
    admin: boolean; t: { get(key: string, values?: Record<string, string | number>): string };
    relations: { key: string; items: { id: string; description: string; sources?: Source[] }[] }[];
    onopen(id: string): void; onclose(): void;
  } = $props();
  let searching = $state(false);
  function connect(other: string) {
    location.assign(`/?${new URLSearchParams([['view', 'family'], ['action', 'connections'], ['connect', id], ['connect', other]])}`);
  }
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;
  let person = $derived(dataset.people[id]);
  let mentions = $derived((chronicle?.chapters || []).filter(chapter => chapter.persons.includes(id)));
  onMount(() => dialog.showModal());
  $effect(() => { if (id && dialog) { searching = false; dialog.scrollTop = 0; heading?.focus(); } });
</script>

<dialog id="personDialog" bind:this={dialog} class="family-person-dialog" aria-labelledby="family-person-title" onclose={onclose}>
  <button class="dialog-close" onclick={() => dialog.close()} aria-label={t.get('close')}>×</button>
  <article id="personDialogContent">
    {#if person.photo && sourceUrl(person.photo, assets)}
      <img class="dialog-portrait" src={sourceUrl(person.photo, assets)} alt="" />
    {/if}
    <h2 bind:this={heading} tabindex="-1" id="family-person-title">{person.name || id}</h2>
    <dl class="person-dates">
      {#if person.birth}<dt>{t.get('fieldBirth')}</dt><dd>{person.birth}</dd>{/if}
      {#if person.death}<dt>{t.get('fieldDeath')}</dt><dd>{person.death}</dd>{/if}
    </dl>
    {#if person.occupation}<p>{person.occupation}</p>{/if}
    <div class="person-actions">
      <a class="action-link" data-show-family={id} href={personHref(id, 'family')}>{t.get('showInTree')}</a>
      <button class="action-link" onclick={() => searching = !searching} aria-expanded={searching}>{t.get('connectionWith')}</button>
      {#if admin}<a class="action-link" data-edit-person={id} href={personHref(id, 'edit')}>{t.get('edit')}</a>{/if}
    </div>
    {#if searching}
      <div class="connection-picker">
        <PersonSearch people={dataset.people} {t} inputId="connection-target" label={t.get('connectionChoose')} exclude={[id]} oncenter={connect} />
        <button onclick={() => searching = false}>{t.get('cancel')}</button>
      </div>
    {/if}
    {#each relations as section}
      {#if section.items.length}
        <section class="person-section">
          <h3>{t.get(section.key)}</h3>
          <ul class="person-relations">
            {#each section.items as relation}
              <li><button onclick={() => onopen(relation.id)}>{dataset.people[relation.id]?.name || relation.id}</button>
                {#if relation.description}<span>{relation.description}</span>{/if}
                {#each relation.sources || [] as source}<span><a href={sourceUrl(source.url, assets)} target="_blank" rel="noreferrer">{source.label || source.url}</a></span>{/each}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
    {#if person.notes?.length}
      <section class="person-section"><h3>{t.get('notes')}</h3>{#each person.notes as note}<p>{note}</p>{/each}</section>
    {/if}
    {#if person.locations?.length}
      <section class="person-section"><h3>{t.get('places')}</h3>
        {#each person.locations as place}<p><strong>{place.label}:</strong> {place.value}</p>{/each}
      </section>
    {/if}
    {#if person.sources?.length}
      <section class="person-section"><h3>{t.get('sources')}</h3><ul>
        {#each person.sources as source}
          <li>{#if sourceUrl(source.url, assets)}<a href={sourceUrl(source.url, assets)} target="_blank" rel="noreferrer">{source.label || source.url}</a>
          {:else}{source.label || source.url}{/if}</li>
        {/each}
      </ul></section>
    {/if}
    {#if mentions.length}
      <section class="person-section"><h3>{t.get('chronicleMentioned')}</h3><ul>
        {#each mentions as chapter}<li><a href={chapterHref(chapter.file)}>{chapter.title}</a></li>{/each}
      </ul></section>
    {/if}
  </article>
</dialog>
