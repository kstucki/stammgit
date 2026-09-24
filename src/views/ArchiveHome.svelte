<script lang="ts">
  import { untrack } from 'svelte';
  import { availableViews, viewHref } from '../domain/archive';
  import type { ArchiveView } from '../domain/archive';
  import type { Workspace } from '../state/workspace.svelte';
  import { personRelations } from '../domain/relationship-view';
  import FamilyView from './FamilyView.svelte';
  import SourcesView from './SourcesView.svelte';
  import AdminView from './AdminView.svelte';
  import ChronicleView from './ChronicleView.svelte';
  import PersonDialog from '../components/PersonDialog.svelte';
  import PersonEditor from '../components/PersonEditor.svelte';
  let { store }: { store: Workspace } = $props();
  const params = new URLSearchParams(location.search), requested = params.get('view');
  let view = $state(untrack(() => {
    const implied = params.has('chapter') ? 'chronicle' : ['tree', 'descendants'].includes(params.get('action') || '') ? 'overview' : 'family';
    const choice = requested && ['connections', 'family', 'overview', 'chronicle', 'sources', 'admin'].includes(requested) ? requested : implied;
    return choice === 'connections' || choice === 'overview' || (!store.admin && ['admin'].includes(choice)) ? 'family' : choice;
  }));
  const person = params.get('person'), action = params.get('action');
  let selected = $state<string | null>(untrack(() => person && store.dataset.people[person] && !['edit', 'family', 'tree', 'descendants'].includes(action || '') ? person : null));
  let editing = $state<string | null>(untrack(() => store.admin && person && store.dataset.people[person] && action === 'edit' ? person : null));
  const labels: Record<ArchiveView, string> = { overview: 'archiveTree', chronicle: 'tabChronicle', sources: 'tabSources', admin: 'tabAdmin' };
  let archive = $derived({ ...store.archive, hasDraft: store.draft, hasChronicle: !!store.chronicle?.chapters.length });
  let relations = $derived(selected ? personRelations(store.dataset, selected, store.t) : []);
  function openPerson(id: string) { if (store.dataset.people[id]) selected = id; }
  function closeEditor() { editing = null; const clean = new URL(location.href); clean.searchParams.delete('person'); clean.searchParams.delete('action'); history.replaceState(null, '', clean); }
</script>
<div class="archive-shell family-shell">
  <header class="archive-header"><div class="archive-identity"><h1>{archive.config.overview?.heading || archive.config.title}</h1></div><div class="actions"><a href="/.netlify/functions/logout">{store.t.get('logout')}</a></div></header>
  <main>
    {#if store.pending}<p class="draft-notice" role="status">{store.t.get('draftActive')}</p>{/if}
    <nav class="archive-navigation" aria-label={store.t.get('archiveNavigation')}>
      <a href="/" aria-current={view === 'family' ? 'page' : undefined}>{store.t.get('archiveTree')}</a>
      {#each availableViews(archive) as next}<a href={viewHref(next)} data-view={next} aria-current={next === view ? 'page' : undefined}>{store.t.get(labels[next])}</a>{/each}
    </nav>
    {#if view === 'family'}<FamilyView {archive} session={store.session} {person} action={requested === 'connections' ? 'connections' : action} overview={requested === 'overview'} />
    {:else if view === 'sources'}<SourcesView {store} onperson={openPerson} />
    {:else if view === 'admin' && store.admin}<AdminView {store} />
    {:else if view === 'chronicle'}<ChronicleView {store} onperson={openPerson} initialFile={params.has('chapter') ? params.get('chapter') : undefined} initialSection={location.hash.slice(1)} />{/if}
  </main>
</div>
{#if selected && store.dataset.people[selected]}<PersonDialog id={selected} dataset={store.dataset} assets={store.assets} chronicle={store.chronicle} admin={store.admin} t={store.t} {relations} onopen={openPerson} onclose={() => selected = null} />{/if}
{#if editing && store.admin && store.dataset.people[editing]}{#key editing}<PersonEditor {store} id={editing} onclose={closeEditor} onperson={openPerson} />{/key}{/if}
