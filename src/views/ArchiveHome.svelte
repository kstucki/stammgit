<script lang="ts">
  import { untrack, tick, onMount } from 'svelte';
  import PersonSearch from '../components/PersonSearch.svelte';
  import NavigationIcon from '../components/NavigationIcon.svelte';
  import { restorePagePosition } from '../state/page-position';
  import type { GraphSearch } from '../state/graph-search';
  import { viewHref } from '../domain/archive';
  import type { ArchiveView } from '../domain/archive';
  import type { Workspace } from '../state/workspace.svelte';
  import { initialCenter } from '../state/family';
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
  let graphSearch = $state<GraphSearch | null>(null);
  let sourcesQuery = $state(untrack(() => typeof history.state?.sourcesQuery === 'string' ? history.state.sourcesQuery : ''));
  let nav = $derived(['family', ...(store.chronicle?.chapters.length ? ['chronicle'] : []), 'sources', ...(store.admin ? ['admin'] : [])]);
  function logout() { if (confirm(store.t.get('logoutConfirm'))) location.assign('/.netlify/functions/logout'); }
  onMount(() => { if (view !== 'family' && view !== 'chronicle') void tick().then(restorePagePosition); });
  $effect(() => { document.body.classList.toggle('tree-page', view === 'family'); return () => document.body.classList.remove('tree-page'); });
  const person = params.get('person'), action = params.get('action');
  let selected = $state<string | null>(untrack(() => person && store.dataset.people[person] && !['edit', 'family', 'tree', 'descendants'].includes(action || '') ? person : null));
  let editing = $state<string | null>(untrack(() => store.admin && person && store.dataset.people[person] && action === 'edit' ? person : null));
  const labels: Record<string, string> = { family: 'archiveTree', overview: 'archiveTree', chronicle: 'tabChronicle', sources: 'tabSources', admin: 'tabAdmin' };
  let archive = $derived({ ...store.archive, hasDraft: store.draft, hasChronicle: !!store.chronicle?.chapters.length });
  let rememberedCenter = $derived.by(() => { let storage: Storage | undefined; try { storage = sessionStorage; } catch { /* Optional view state. */ } return initialCenter(store.dataset, store.tree, storage); });
  function openPerson(id: string) { if (store.dataset.people[id]) selected = id; }
  function closeEditor() { editing = null; const clean = new URL(location.href); clean.searchParams.delete('person'); clean.searchParams.delete('action'); history.replaceState(history.state, '', clean); }
</script>
<div class="archive-shell family-shell" class:tree-tab={view === 'family'}>
  <header class="archive-header">
    <nav class="archive-navigation" aria-label={store.t.get('archiveNavigation')}>
      {#each nav as next}<a href={next === 'family' ? '/' : viewHref(next as ArchiveView)} data-view={next === 'family' ? 'family' : next} aria-current={next === view ? 'page' : undefined}>
        <NavigationIcon name={next} /><span>{store.t.get(labels[next])}</span>
      </a>{/each}
    </nav>
    {#if view === 'sources'}
      <div class="family-search">
        <label class="visually-hidden" for="sourcesSearch">{store.t.get('sourcesSearchPlaceholder')}</label>
        <input id="sourcesSearch" type="search" bind:value={sourcesQuery} placeholder={store.t.get('sourcesSearchPlaceholder')} />
      </div>
    {:else if view === 'family'}
    <PersonSearch people={store.dataset.people} t={store.t} inputId={view === 'family' && graphSearch?.mode === 'connections' ? 'connection-search' : 'family-search'}
      label={view === 'family' && graphSearch?.mode === 'connections' ? store.t.get('connectionAdd') : undefined}
      exclude={view === 'family' ? graphSearch?.exclude || [] : []}
      oncenter={id => view === 'family' && graphSearch ? graphSearch.choose(id) : openPerson(id)}
      onadd={view === 'family' ? graphSearch?.add : undefined} />
    {/if}
    <button class="logout-button" onclick={logout} aria-label={store.t.get('logout')}><NavigationIcon name="logout" /></button>
  </header>
  <main>
    {#if store.pending && view !== 'family'}<p class="draft-notice" role="status">{store.t.get('draftActive')}</p>{/if}
    {#if view === 'family'}<FamilyView onsearch={value => graphSearch = value} {archive} session={store.session} {person} action={requested === 'connections' ? 'connections' : action} overview={requested === 'overview'} />
    {:else if view === 'sources'}<SourcesView {store} onperson={openPerson} bind:query={sourcesQuery} />
    {:else if view === 'admin' && store.admin}<AdminView {store} />
    {:else if view === 'chronicle'}<ChronicleView {store} onperson={openPerson} initialFile={params.has('chapter') ? params.get('chapter') : undefined} initialSection={location.hash.slice(1)} />{/if}
  </main>
</div>
{#if selected && store.dataset.people[selected]}<PersonDialog id={selected} dataset={store.dataset} assets={store.assets} chronicle={store.chronicle} admin={store.admin} t={store.t} center={graphSearch?.center || rememberedCenter} onclose={() => selected = null} onfamily={view === 'family' ? id => { graphSearch?.showFamily(id); selected = null; } : undefined} onconnect={view === 'family' ? (from, to) => { graphSearch?.connectPair(from, to); selected = null; } : undefined} />{/if}
{#if editing && store.admin && store.dataset.people[editing]}{#key editing}<PersonEditor {store} id={editing} onclose={closeEditor} onperson={openPerson} />{/key}{/if}
