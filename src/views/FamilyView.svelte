<script lang="ts">
  import { describeConnections } from '../domain/kinship';
  import { expandGraph, type Expansion, type Direction } from '../domain/graph-expansion';
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
  import ResponsivePanel from '../components/ResponsivePanel.svelte';
  import type { PanelLevel } from '../components/ResponsivePanel.svelte';
  import type { GraphSearch } from '../state/graph-search';
  import PersonDialog from '../components/PersonDialog.svelte';
  import FamilyCanvas from '../components/FamilyCanvas.svelte';
  import GraphViewSwitcher from '../components/GraphViewSwitcher.svelte';
  let { archive, session, person = null, action = null, overview = false, onsearch }: {
    onsearch(value: GraphSearch): void; archive: ArchiveSnapshot; session: FamilySession; person?: string | null; action?: string | null; overview?: boolean;
  } = $props();
  let panelLevel = $state<PanelLevel>('collapsed');
  let panelHeight = $state(0);
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
  let descriptionsByPair = $derived(connections ? describeConnections(dataset, connections.selected, t) : []);
  let baseScene = $derived(mode === 'connections' ? {
    family: connections!.family,
    generations: connections!.family ? computeGenerations(dataset.people, new Set(connections!.family.people), connections!.family.center) as Map<string, number> : undefined,
  } : selectGraph(dataset, activeCenter, mode, activeRoots));
  let expansionContext = $derived(JSON.stringify([mode, activeCenter, connections?.selected ?? activeRoots]));
  let expansion = $state<{ context: string; steps: Expansion[] }>({ context: '', steps: [] });
  let steps = $derived(expansion.context === expansionContext ? expansion.steps : []);
  let scene = $derived({ ...baseScene, family: baseScene.family ? expandGraph(dataset, baseScene.family, steps) : null });
  $effect(() => { if (expansion.context !== expansionContext) expansion = { context: expansionContext, steps: [] }; });
  function expand(id: string, direction: Direction) {
    expansion = { context: expansionContext, steps: [...steps, { id, direction }] };
  }
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
    history.replaceState(history.state, '', url);
  });
  $effect(() => rememberGraphState(archive.tree.id, { mode, roots: activeRoots }, storage));
  function chooseCenter(id: string) {
    if (!Object.hasOwn(dataset.people, id)) return;
    if (mode === 'connections') mode = 'family';
    expansion = { context: '', steps: [] };
    center = id; selected = null;
    roots = [id];
    rememberCenter(archive.tree.id, id, storage);
  }
  function addRoot(id: string) { roots = [...new Set([...activeRoots, id])]; }

  function showFamily(id: string) { mode = 'family'; chooseCenter(id); }
  function connectPair(from: string, to: string) { connectionSelection = [from, to]; mode = 'connections'; panelLevel = 'collapsed'; selected = null; }
  $effect(() => {
    onsearch({ mode, center: activeCenter, showFamily, connectPair, exclude: connections?.selected || [],
      choose: connections ? id => connectionSelection = [...connections!.selected, id] : chooseCenter,
      add: mode === 'hourglass' ? addRoot : undefined });
  });

</script>

<section class="family-view" class:connections-view={mode === 'connections'} aria-label={t.get(modeLabel[mode])} data-center={activeCenter} data-mode={mode} style:--sheet-height={`${connections ? panelHeight : 0}px`}>
  <div class="graph-tools"><GraphViewSwitcher bind:mode {t} /></div>
  <div class="graph-workspace">
    <div class="graph-frame">
      {#if mode === 'hourglass' && activeRoots.length > 1}
        <div class="graph-roots hourglass-roots">{#each activeRoots as id}<button disabled={id === activeCenter} aria-label={t.get('graphRemoveRoot', { name: dataset.people[id].name || id })} onclick={() => roots = roots.filter(root => root !== id)}>{dataset.people[id].name || id}{id !== activeCenter ? ' ×' : ''}</button>{/each}</div>
      {/if}
      {#if scene.family}
        {#key JSON.stringify([mode, activeCenter, connections?.selected ?? activeRoots])}
          <FamilyCanvas onexpand={expand} family={scene.family} selectedIds={connections?.selected} generations={scene.generations} {mode} initialScale={scale} onscale={value => scale = value} {dataset} assets={session.assets} {t} onopen={id => selected = id} oncenter={chooseCenter} />
        {/key}
      {/if}
    </div>
    {#if connections}
      <ResponsivePanel id="connectionPanel" kind="connections" label={t.get('tabConnections')} {t} bind:level={panelLevel} collapsible onheight={height => panelHeight = height}>
        <div class="graph-roots connection-chips">{#each connections.selected as id}
          <button data-connection-selected={id} aria-label={t.get('connectionRemove', { name: dataset.people[id].name || id })} onclick={() => connectionSelection = connections!.selected.filter(other => other !== id)}>{dataset.people[id].name || id} ×</button>
        {/each}</div>
        <div class="graph-description" aria-live="polite">
          {#if descriptionsByPair.length}
            <ul class="connection-descriptions">
              {#each descriptionsByPair as pair, i}
                <li class:secondary-description={i > 0} data-connection-description={JSON.stringify([pair.a, pair.b])}>
                  {#if pair.message}{pair.message}{:else if pair.sentence}{pair.sentence}{:else}<strong>{pair.heading}</strong> {pair.chain.join(' → ')}{/if}
                </li>
              {/each}
            </ul>
            {#if descriptionsByPair.length > 1}<button class="more-connections" onclick={() => panelLevel = 'half'}>{t.get('connectionMore', { n: descriptionsByPair.length - 1 })}</button>{/if}
          {:else}<p role="status">{t.get('connectionPrompt')}</p>{/if}
          {#if steps.length}<button class="connection-reset" onclick={() => expansion = { context: expansionContext, steps: [] }}>{t.get('connectionsOnly')}</button>{/if}
          {#if connections.components.length > 1}<p role="status">{t.get('connectionDisconnected', { groups: connections.components.map(ids => ids.map(id => dataset.people[id].name || id).join(', ')).join(' / ') })}</p>{/if}
        </div>
      </ResponsivePanel>
    {/if}
  </div>
</section>
{#if selected}
  <PersonDialog id={selected} {dataset} assets={session.assets} chronicle={session.chronicle} admin={archive.role === 'admin'} {t}
    center={activeCenter} onclose={() => selected = null} onfamily={showFamily} onconnect={connectPair} />
{/if}
