<script lang="ts">
  import { computeGenerations } from '../../public/assets/graph.js';
  import { readConnections, rememberConnections } from '../state/connections';
  import { selectConnections } from '../domain/connections';
  import { untrack } from 'svelte';
  import { getT } from '../../public/assets/strings.js';
  import type { ArchiveSnapshot } from '../domain/archive';
  import type { FamilySession } from '../data/family';
  import { selectGraph, modeLabel } from '../domain/tree-selection';
  import type { GraphMode } from '../domain/tree-selection';
  import { defaultRootIds } from '../../public/assets/view-config.js';
  import { initialCenter, rememberCenter, readGraphState, rememberGraphState, readZoom, rememberZoom } from '../state/family';
  import { personRelations } from '../domain/relationship-view';
  import PersonSearch from '../components/PersonSearch.svelte';
  import PersonDialog from '../components/PersonDialog.svelte';
  import FamilyCanvas from '../components/FamilyCanvas.svelte';
  import GraphViewSwitcher from '../components/GraphViewSwitcher.svelte';
  let { archive, session, person = null, action = null, overview = false }: {
    archive: ArchiveSnapshot; session: FamilySession; person?: string | null; action?: string | null; overview?: boolean;
  } = $props();
  let connectionControlsHeight = $state(0);
  const descriptions: Record<GraphMode, string> = {
    family: 'graphFamilyDescription', hourglass: 'graphHourglassDescription', descendants: 'graphDescendantsDescription',
    ancestors: 'graphAncestorsDescription', connections: 'graphConnectionsDescription',
  };
  let dataset = $derived(session.dataset);
  let storage: Storage | undefined;
  try { storage = window.sessionStorage; } catch { /* View state is optional. */ }
  const restored = untrack(() => readGraphState(dataset, archive.tree.id, storage));
  let zoomStorage: Storage | undefined;
  try { zoomStorage = window.localStorage; } catch { /* Optional zoom persistence. */ }
  let scale = $state(untrack(() => readZoom(archive.tree.id, zoomStorage, storage)));
  $effect(() => rememberZoom(scale, zoomStorage));
  let center = $state(untrack(() => {
    if (person && dataset.people[person] && ['family', 'tree', 'descendants'].includes(action || '')) {
      if (action === 'family') rememberCenter(archive.tree.id, person, storage);
      return person;
    }
    if (overview && !person) return defaultRootIds(archive.config, archive.tree.id, dataset.meta.focusPersonId)
      .find((id: string) => dataset.people[id]) || dataset.meta.focusPersonId;
    return initialCenter(dataset, archive.tree.id, storage);
  }));
  let mode = $state<GraphMode>(untrack(() => action === 'connections' ? 'connections' : action === 'family' ? 'family' : action === 'descendants' ? 'descendants' : action === 'tree' || (overview && !action) ? 'hourglass' : restored.mode));
  let roots = $state<string[]>(untrack(() => overview && !person ? defaultRootIds(archive.config, archive.tree.id, center).filter((id: string) => dataset.people[id]) : person ? [center] : restored.roots.length ? restored.roots : [center]));
  let selected = $state<string | null>(null);
  let t = $derived(getT(archive.config.language === 'en' ? 'en' : 'de'));
  // Deleting a selected person in the editor must not leave a dangling view.
  let activeCenter = $derived(dataset.people[center] ? center : dataset.meta.focusPersonId);
  let activeRoots = $derived([...new Set([activeCenter, ...roots.filter(id => dataset.people[id])])]);
  let connectionSelection = $state<string[] | null>(null);
  const connectionParams = new URLSearchParams(location.search);
  let connections = $derived(mode === 'connections' ? selectConnections(dataset, connectionSelection ??
    (connectionParams.has('connectEmpty') ? [] : readConnections(dataset, archive.tree.id, connectionParams.getAll('connect'), storage, activeCenter))) : null);
  let scene = $derived(mode === 'connections' ? {
    family: connections!.family,
    generations: connections!.family ? computeGenerations(dataset.people, new Set(connections!.family.people), connections!.family.center) as Map<string, number> : undefined,
  } : selectGraph(dataset, activeCenter, mode, activeRoots));
  $effect(() => {
    if (connections) {
      if (connectionSelection === null) connectionSelection = connections.selected;
      rememberConnections(archive.tree.id, connections.selected, storage);
    }
  });
  $effect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('connect'); url.searchParams.delete('connectEmpty');
    if (connections) {
      url.searchParams.set('view', 'family'); url.searchParams.set('action', 'connections');
      url.searchParams.delete('person');
      for (const id of connections.selected) url.searchParams.append('connect', id);
      if (!connections.selected.length) url.searchParams.set('connectEmpty', '1');
    } else if (url.searchParams.get('action') === 'connections' || url.searchParams.get('view') === 'connections') {
      url.searchParams.set('view', 'family'); url.searchParams.delete('action');
    }
    history.replaceState(null, '', url);
  });
  $effect(() => rememberGraphState(archive.tree.id, { mode, roots: activeRoots }, storage));
  function chooseCenter(id: string) {
    if (!Object.hasOwn(dataset.people, id)) return;
    if (mode === 'connections') mode = 'family';
    center = id; selected = null;
    roots = [id];
    rememberCenter(archive.tree.id, id, storage);
  }
  function addRoot(id: string) { roots = [...new Set([...activeRoots, id])]; }

</script>

<section class="family-view" class:connections-view={mode === 'connections'} aria-label={t.get(modeLabel[mode])} data-center={activeCenter} data-mode={mode}>
  <div class="graph-frame" style:--connection-controls-height={`${connections ? connectionControlsHeight : 0}px`}>
    <div class="graph-tools">
      <div class="family-toolbar">
        <GraphViewSwitcher bind:mode {t} />
        {#if connections}
          <PersonSearch people={dataset.people} {t} inputId="connection-search" label={t.get('connectionAdd')} exclude={connections.selected} oncenter={id => connectionSelection = [...connections!.selected, id]} />
        {:else}<PersonSearch people={dataset.people} {t} oncenter={chooseCenter} onadd={mode === 'hourglass' ? addRoot : undefined} />{/if}
      </div>
      <div class="connection-controls" bind:clientHeight={connectionControlsHeight}>
        {#if connections}
          <div class="graph-roots">{#each connections.selected as id}
            <button data-connection-selected={id} aria-label={t.get('connectionRemove', { name: dataset.people[id].name || id })} onclick={() => connectionSelection = connections!.selected.filter(other => other !== id)}>{dataset.people[id].name || id} ×</button>
          {/each}</div>
          {#if connections.selected.length < 2}<p role="status">{t.get('connectionPrompt')}</p>{/if}
          {#if connections.components.length > 1}<p role="status">{t.get('connectionDisconnected', { groups: connections.components.map(ids => ids.map(id => dataset.people[id].name || id).join(', ')).join(' / ') })}</p>{/if}
        {/if}
      </div>
      {#if mode === 'hourglass' && activeRoots.length > 1}
        <div class="graph-roots">{#each activeRoots as id}<button disabled={id === activeCenter} aria-label={t.get('graphRemoveRoot', { name: dataset.people[id].name || id })} onclick={() => roots = roots.filter(root => root !== id)}>{dataset.people[id].name || id}{id !== activeCenter ? ' ×' : ''}</button>{/each}</div>
      {/if}
    </div>
    {#if scene.family}
    {#key JSON.stringify([mode, activeCenter, connections?.selected ?? activeRoots])}
      <FamilyCanvas family={scene.family} selectedIds={connections?.selected} generations={scene.generations} {mode} initialScale={scale} onscale={value => scale = value} {dataset} assets={session.assets} {t} onopen={id => selected = id} oncenter={chooseCenter} />
    {/key}
    {/if}
  </div>
  <p class="graph-description" aria-live="polite">{t.get(descriptions[mode])}</p>
  {#if mode === 'family' && scene.family?.people.length === 1}<p>{t.get('familyNoRelations')}</p>{/if}
</section>
{#if selected}
  <PersonDialog id={selected} {dataset} assets={session.assets} chronicle={session.chronicle} admin={archive.role === 'admin'} {t}
    relations={personRelations(dataset, selected, t)} onopen={id => selected = id} onclose={() => selected = null} />
{/if}
