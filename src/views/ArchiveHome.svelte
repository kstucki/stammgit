<script lang="ts">
  import { untrack, tick, onMount } from 'svelte';
  import WelcomeView from './WelcomeView.svelte';
  import { readMe, saveMe, welcomeSeen, rememberWelcome } from '../state/identity';
  import ArchiveMenu from '../components/ArchiveMenu.svelte';
  import SearchCombobox from '../components/SearchCombobox.svelte';
  import { sourceDocuments, matchesSource, readSourceFilter } from '../domain/sources';
  import PersonSearch from '../components/PersonSearch.svelte';
  import NavigationIcon from '../components/NavigationIcon.svelte';
  import { navigation, navigate, readState, listenNavigation, closePersonInfo, rememberNavigationState } from '../state/navigation';
  import { defaultRootIds } from '../../public/assets/view-config.js';
  import { readConnections } from '../state/connections';
  import { restorePagePosition } from '../state/page-position';
  import type { GraphSearch } from '../state/graph-search';
  import { viewHref } from '../domain/archive';
  import type { ArchiveView } from '../domain/archive';
  import type { Workspace } from '../state/workspace.svelte';
  import { initialCenter, readGraphState } from '../state/family';
  import FamilyView from './FamilyView.svelte';
  import SourcesView from './SourcesView.svelte';
  import AdminView from './AdminView.svelte';
  import ChronicleView from './ChronicleView.svelte';
  import PersonDialog from '../components/PersonDialog.svelte';
  import PersonEditor from '../components/PersonEditor.svelte';
  let { store }: { store: Workspace } = $props();
  let me = $state(untrack(() => readMe(store.dataset.people)));
  let welcoming = $state(untrack(() => !welcomeSeen()));
  $effect(() => {
    if (me && !Object.hasOwn(store.dataset.people, me)) { me = ''; saveMe(''); }
  });
  const params = new URLSearchParams(location.search);
  let storage: Storage | undefined;
  try { storage = sessionStorage; } catch { /* Optional preferences. */ }
  const initial = untrack(() => readState(new URL(location.href)));
  const savedGraph = untrack(() => readGraphState(store.dataset, store.tree, storage));
  const overviewRoots = untrack(() => params.get('view') === 'overview' && !initial.person ? defaultRootIds(store.archive.config, store.tree, store.dataset.meta.focusPersonId).filter((id: string) => store.dataset.people[id]) : []);
  const initialPerson = untrack(() => initial.person && store.dataset.people[initial.person] ? initial.person : me || overviewRoots[0] || initialCenter(store.dataset, store.tree, storage));
  untrack(() => navigate({ ...initial, person: initialPerson,
    language: initial.language || store.language,
    action: initial.action && initial.action !== 'person' ? initial.action : params.has('view') || me ? 'family' : savedGraph.mode === 'hourglass' ? 'tree' : savedGraph.mode,
    roots: initial.roots.length ? initial.roots : initial.person || me ? [initialPerson] : overviewRoots.length ? overviewRoots : savedGraph.roots.length ? savedGraph.roots : [initialPerson],
    connect: initial.connectEmpty ? [] : initial.connect.length ? readConnections(store.dataset, store.tree, initial.connect, storage, initialPerson) : me ? [me] : readConnections(store.dataset, store.tree, [], storage, initialPerson),
  }, { push: false }));
  function chooseMe(id: string) {
    me = Object.hasOwn(store.dataset.people, id) ? id : '';
    saveMe(me);
    if (me) {
      navigate({ view: 'family', action: 'family', person: me, roots: [me], connect: [me], connectEmpty: false, info: '', section: '' });
    } else {
      navigate({ connect: [$navigation.person], connectEmpty: false }, { push: false });
    }
  }
  function finishWelcome(id: string) {
    rememberWelcome(); welcoming = false;
    me = Object.hasOwn(store.dataset.people, id) ? id : '';
    saveMe(me);
    if (me) {
      navigate({ view: 'family', action: 'family', person: me, roots: [me], connect: [me], connectEmpty: false, info: '', section: '' }, { push: false });
    } else {
      navigate({ view: 'family', chapter: '', section: '' }, { push: false });
    }
  }
  let view = $derived((!store.admin && $navigation.view === 'admin') || !['family', 'chronicle', 'sources', 'admin'].includes($navigation.view) ? 'family' : $navigation.view);
  let graphSearch = $state<GraphSearch | null>(null);
  let sourcesQuery = $state(untrack(() => typeof history.state?.sourcesQuery === 'string' ? history.state.sourcesQuery : ''));
  let sourcesFilter = $state(untrack(() => readSourceFilter(history.state?.sourcesFilter)));
  let sourceMatches = $derived(sourceDocuments(store.dataset.people, store.sourceFiles, store.dataset.sourceDetails).filter(doc => matchesSource(doc, sourcesQuery, store.dataset)));
  function searchSources(value: string) { sourcesQuery = value; sourcesFilter = { ...sourcesFilter, page: 1, selected: '' }; }
  const nav = ['family', 'chronicle'];
  function logout() { if (confirm(store.t.get('logoutConfirm'))) location.assign('/.netlify/functions/logout'); }
  onMount(listenNavigation);
  $effect(() => { void $navigation; if (view !== 'family') void tick().then(restorePagePosition); sourcesQuery = history.state?.sourcesQuery || ''; sourcesFilter = readSourceFilter(history.state?.sourcesFilter); });
  // Restore before saving in the same owner: a remounting SourcesView must not
  // overwrite the history entry with its initial empty query during Back.
  $effect(() => { if (view === 'sources') rememberNavigationState({ sourcesQuery, sourcesFilter: $state.snapshot(sourcesFilter) }); });
  $effect(() => { document.body.classList.toggle('tree-page', view === 'family' && !welcoming); return () => document.body.classList.remove('tree-page'); });
  let chronicleLanguage = $derived($navigation.language || 'de');
  $effect(() => { store.language = chronicleLanguage === 'pt' ? 'pt' : chronicleLanguage === 'en' ? 'en' : 'de'; document.documentElement.lang = chronicleLanguage === 'pt' ? 'pt-BR' : chronicleLanguage; try { localStorage.setItem('chronicleLanguage', chronicleLanguage); } catch { /* Optional preference. */ } });
  function changeLanguage(code: string) {
    const oldSet = store.chronicle?.variants?.[chronicleLanguage] || store.chronicle;
    const nextSet = store.chronicle?.variants?.[code] || store.chronicle;
    const index = oldSet?.chapters.findIndex(ch => ch.file === $navigation.chapter) ?? -1;
    navigate({ language: code, chapter: index >= 0 ? nextSet?.chapters[index]?.file || '' : '', section: '' }, { push: false });
  }
  let personChronicle = $derived(chronicleLanguage ? store.chronicle?.variants?.[chronicleLanguage] || store.chronicle : store.chronicle);
  let selected = $derived($navigation.info || null);
  let editing = $state<string | null>(untrack(() => store.admin && initial.person && initial.action === 'edit' ? initial.person : null));
  const labels: Record<string, string> = { family: 'archiveTree', overview: 'archiveTree', chronicle: 'tabChronicle', sources: 'tabSources', admin: 'tabAdmin' };
  let archive = $derived({ ...store.archive, config: { ...store.archive.config, language: store.language }, hasDraft: store.draft, hasChronicle: !!store.chronicle?.chapters.length });
  let rememberedCenter = $derived.by(() => { let storage: Storage | undefined; try { storage = sessionStorage; } catch { /* Optional view state. */ } return initialCenter(store.dataset, store.tree, storage); });
  function openPerson(id: string) { if (store.dataset.people[id]) navigate({ info: id }); }
  function closeEditor() { editing = null; navigate({ action: 'family' }, { push: false }); }
  function showFamily(id: string) { navigate({ view: 'family', action: 'family', person: id, roots: [id], info: '', section: '' }); }
  function connectPair(from: string, to: string) { navigate({ view: 'family', action: 'connections', connect: [from, to], connectEmpty: false, info: '', section: '' }); }
</script>
{#if welcoming}
  <WelcomeView people={store.dataset.people} {me} t={store.t} oncontinue={finishWelcome} />
{:else}
<div class="archive-shell family-shell" class:tree-tab={view === 'family'}>
  <header class="archive-header">
    <nav class="archive-navigation" aria-label={store.t.get('archiveNavigation')}>
      {#each nav as next}<a href={next === 'family' ? '/' : `${viewHref(next as ArchiveView)}&language=${chronicleLanguage}`} data-view={next === 'family' ? 'family' : next} aria-current={next === view ? 'page' : undefined}>
        <NavigationIcon name={next} /><span>{store.t.get(labels[next])}</span>
      </a>{/each}
    </nav>
    {#if view === 'sources'}
      <SearchCombobox inputId="sourcesSearch" label={store.t.get('sourcesSearchPlaceholder')} bind:query={() => sourcesQuery, searchSources}
        options={sourceMatches.map(doc => ({ id: doc.url, label: doc.label }))} noResults={store.t.get('noHits')}
        clearOnChoose={false} onchoose={url => { searchSources(sourceMatches.find(doc => doc.url === url)?.label || url); sourcesFilter = { category: 'all', family: '', page: 1, selected: url }; }} />
    {:else if view === 'family'}
    <PersonSearch people={store.dataset.people} t={store.t} inputId={view === 'family' && graphSearch?.mode === 'connections' ? 'connection-search' : 'family-search'}
      label={view === 'family' && graphSearch?.mode === 'connections' ? store.t.get('connectionAdd') : undefined}
      exclude={view === 'family' ? graphSearch?.exclude || [] : []}
      oncenter={id => view === 'family' && graphSearch ? graphSearch.choose(id) : openPerson(id)}
      onadd={view === 'family' ? graphSearch?.add : undefined} />
    {/if}
    <ArchiveMenu admin={store.admin} language={chronicleLanguage} portuguese={true} t={store.t} onlanguage={changeLanguage} onlogout={logout} people={store.dataset.people} {me} onme={chooseMe} />
  </header>
  <main>
    {#if store.pending && view !== 'family'}<p class="draft-notice" role="status">{store.t.get('draftActive')}</p>{/if}
    {#if view === 'family'}<FamilyView {me} onsearch={value => graphSearch = value} {archive} session={store.session} route={$navigation} onperson={openPerson} />
    {:else if view === 'sources'}<SourcesView {store} onperson={openPerson} query={sourcesQuery} onclear={() => searchSources('')} bind:filter={sourcesFilter} personOpen={!!selected} />
    {:else if view === 'admin' && store.admin}<AdminView {store} language={chronicleLanguage} />
    {:else if view === 'chronicle'}<ChronicleView {store} onperson={openPerson} initialFile={$navigation.chapter} initialLanguage={chronicleLanguage === 'de' ? '' : chronicleLanguage} initialSection={$navigation.section} />{/if}
  </main>
</div>
{#if selected && store.dataset.people[selected]}<PersonDialog id={selected} dataset={store.dataset} assets={store.assets} sourceFiles={store.sourceFiles} chronicle={personChronicle} chronicleLanguage={chronicleLanguage === 'de' ? '' : chronicleLanguage} admin={store.admin} t={store.t} center={me || graphSearch?.center || rememberedCenter} onclose={closePersonInfo} onperson={openPerson} onfamily={showFamily} onconnect={connectPair} />{/if}
{#if editing && store.admin && store.dataset.people[editing]}{#key editing}<PersonEditor {store} id={editing} onclose={closeEditor} onperson={openPerson} />{/key}{/if}
{/if}
