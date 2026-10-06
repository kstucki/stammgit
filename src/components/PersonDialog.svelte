<script lang="ts">
  import { personContent } from "../../public/assets/person-language.js";
  import PersonSearch from './PersonSearch.svelte';
  import { tick } from 'svelte';
  import ResponsivePanel from './ResponsivePanel.svelte';
  import type { PanelLevel } from './ResponsivePanel.svelte';
  import { navigateFromContent } from '../state/page-position';
  import { chapterHref, personHref } from '../domain/person';
  import type { Dataset, ChronicleIndex } from '../domain/person';
  import { localizedSource } from '../domain/source-language';
  import { sourceUrl } from '../data/family';
  import { familyChips, personInitials, personLifeDetails, lowEvidence } from '../domain/person-info';
  import { relationshipEngine } from '../domain/relationship-engine';
  import { formatKinship } from '../domain/kinship';
  import { personRelations } from '../domain/relationship-view';
  let { id, center, dataset, assets, sourceFiles = new Set<string>(), chronicle, chronicleLanguage = '', admin, t, onclose, onfamily, onconnect, onperson }: {
    id: string; center: string; dataset: Dataset; assets: ReadonlyMap<string, string>; sourceFiles?: ReadonlySet<string>; chronicle: ChronicleIndex | null; chronicleLanguage?: string;
    admin: boolean; t: { locale?: string; get(key: string, values?: Record<string, string | number>): string };
    onperson?(id: string): void; onclose(): void; onfamily?(id: string): void; onconnect?(from: string, to: string): void;
  } = $props();
  let trail = $state<string[]>([]);
  $effect(() => { void id; trail = []; });
  let shown = $derived(trail.at(-1) || id);
  let person = $derived(dataset.people[shown]);
  let searching = $state(false), storiesExpanded = $state(false), storyHeight = $state(0);
  let level = $state<PanelLevel>('full');
  let heading = $state<HTMLHeadingElement>();
  let groups = $derived(familyChips(dataset, shown, t));
  let notes = $derived(personContent(person, t.locale).notes);
  let occupation = $derived(personContent(person, t.locale).occupation);
  let lifeDetails = $derived(personLifeDetails(person, t.locale));
  let mentions = $derived((chronicle?.chapters || []).filter(chapter => chapter.persons.includes(shown)));
  let sources = $derived([...new Map([
    ...(person.sources || []),
    ...personRelations(dataset, shown, t).flatMap(group => group.items.flatMap(item => (item.sources || []).map(source => ({ ...source, label: `${dataset.people[item.id]?.name || item.id}: ${source.label || source.url}` })))),
  ].map(source => [`${source.url}:${source.label}`, source])).values()]);
  let engine = $derived(relationshipEngine(dataset));
  let explanation = $derived(shown === center || !dataset.people[center] ? null : engine.explain(center, shown));
  let kinship = $derived(explanation ? formatKinship(dataset, explanation, t) : null);
  let stationCount = $derived(kinship?.stationCount || 0);
  function openPair(from: string, to: string) {
    if (onconnect) { onconnect(from, to); return; }
    navigateFromContent(`/?${new URLSearchParams([['view', 'family'], ['action', 'connections'], ['connect', from], ['connect', to]])}`);
  }
  function openPerson(other: string) { if (onperson) onperson(other); else trail = [...(trail.length ? trail : [id]), other]; }
  function showFamily(event: MouseEvent) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); if (onfamily) onfamily(shown); else navigateFromContent(personHref(shown, 'family'));
  }
  $effect(() => { if (shown) { searching = false; storiesExpanded = false; void tick().then(() => { heading?.closest('.panel-body')?.scrollTo(0, 0); heading?.focus({ preventScroll: true }); }); } });
</script>

<ResponsivePanel id="personDialog" kind="person" labelledby="family-person-title" {onclose} {t} bind:level collapsible>
  {#key shown}
  <article id="personDialogContent">
    <header class="person-info-head">
      {#if person.photo && sourceUrl(person.photo, assets)}<img class="person-info-avatar" src={sourceUrl(person.photo, assets)} alt="" />
      {:else}<span class="person-info-avatar person-initials" aria-hidden="true">{personInitials(person.name || shown)}</span>{/if}
      <div class="person-info-heading">
        <h2 bind:this={heading} tabindex="-1" id="family-person-title">{person.name || shown}</h2>
        {#if person.birthSurname && !(person.name || '').split(/[\s()-]+/).includes(person.birthSurname.split(' ').pop() || '')}<p class="person-info-birthname">{t.get('infoBirthSurname', { name: person.birthSurname })}</p>{/if}
        {#if lifeDetails.length}<div class="person-info-life">{#each lifeDetails as event}<p>{event}</p>{/each}</div>{/if}
        {#if occupation}<p class="person-info-occupation">{occupation}</p>{/if}
        {#if lowEvidence(person)}<span class="person-evidence">{t.get('infoLowEvidence')}</span>{/if}
      </div>
    </header>
    {#if kinship && stationCount}
      <div class="person-kinship" data-person-kinship>
        {#if stationCount <= 2}{kinship.relation}
        {:else}{t.get('infoStations', { n: stationCount })} · <a href={`/?view=family&action=connections&connect=${encodeURIComponent(center)}&connect=${encodeURIComponent(shown)}`} onclick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); openPair(center, shown); } }}>{t.get('infoShowConnection')}</a>{/if}
      </div>
    {/if}
    <div class="person-actions">
      <a class="action-link" data-show-family={shown} href={personHref(shown, 'family')} onclick={showFamily}>{t.get('infoInTree')}</a>
      <button class="action-link" onclick={() => searching = !searching} aria-expanded={searching}>{t.get('infoConnection')}</button>
      {#if admin}<a class="action-link person-edit-icon" data-edit-person={shown} href={personHref(shown, 'edit')} aria-label={t.get('edit')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5" /></svg></a>{/if}
    </div>
    {#if searching}<div class="connection-picker"><PersonSearch people={dataset.people} {t} inputId="connection-target" label={t.get('connectionChoose')} exclude={[shown]} oncenter={other => openPair(shown, other)} /><button onclick={() => searching = false}>{t.get('cancel')}</button></div>{/if}
    <div class="person-extra">
      {#if notes.length}<section class="person-stories"><h3>{t.get('infoStories')}</h3>
        <div class:stories-clipped={!storiesExpanded}><div bind:clientHeight={storyHeight}>{#each notes as note}<p>{note}</p>{/each}</div></div>
        {#if storyHeight > 154}<button class="text-action" aria-expanded={storiesExpanded} onclick={() => storiesExpanded = !storiesExpanded}>{t.get(storiesExpanded ? 'infoReadLess' : 'infoReadMore')}</button>{/if}
      </section>{/if}
      {#if groups.length}<section class="person-family-chips" aria-label={t.get('infoFamily')}>
        {#each groups as group}<div class="person-family-chip" data-family-chip={group.key}>
          <span class="family-chip-label">{group.label}</span>
          {#each group.items as relative, i}
            {#if i}<span aria-hidden="true">·</span>{/if}<button data-info-person={relative.id} onclick={() => openPerson(relative.id)}>{relative.name}{#if relative.annotation}<small> ({relative.annotation})</small>{/if}</button>
          {/each}
        </div>{/each}
      </section>{/if}
      {#if person.locations?.length}<details class="person-disclosure"><summary>{t.get('places')}</summary>{#each person.locations as place}<p><strong>{place.label}:</strong> {place.value}</p>{/each}</details>{/if}
      {#if person.links?.length}<section class="person-disclosure person-web-links" data-info-links>
        <h3>{t.get('webLinks')}</h3><ul>{#each person.links as link}<li><a href={link.url} target="_blank" rel="noreferrer">{link.label || link.url}</a></li>{/each}</ul>
      </section>{/if}
      {#if sources.length}<details class="person-disclosure" data-info-sources><summary>{t.get(sources.length === 1 ? 'infoSource' : 'infoSources', { n: sources.length })}</summary><ul>{#each sources as source}<li>{#if sourceUrl(localizedSource(source.url, t.locale, sourceFiles), assets)}<a href={sourceUrl(localizedSource(source.url, t.locale, sourceFiles), assets)} target="_blank" rel="noreferrer">{source.label || source.url}</a>{:else}{source.label || source.url}{/if}</li>{/each}</ul></details>{/if}
      {#if mentions.length}<details class="person-disclosure" data-info-chapters><summary>{t.get(mentions.length === 1 ? 'infoChapter' : 'infoChapters', { n: mentions.length })}</summary><ul>{#each mentions as chapter}<li><a href={chapterHref(chapter.file, chronicleLanguage)}>{chapter.title}</a></li>{/each}</ul></details>{/if}
    </div>
  </article>
  {/key}
</ResponsivePanel>
