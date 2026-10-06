<script lang="ts">
  import { describeConnections } from '../domain/kinship';
  import { expandGraph, type Expansion, type Direction } from '../domain/graph-expansion';
  import { computeGenerations, hourglassMaxDepth } from '../domain/graph/selection';
  import { rememberConnections } from '../state/connections';
  import { selectConnections } from '../domain/connections';
  import { untrack } from 'svelte';
  import { getT } from '../../public/assets/strings.js';
  import type { ArchiveSnapshot } from '../domain/archive';
  import type { FamilySession } from '../data/family';
  import { selectGraph, modeLabel } from '../domain/tree-selection';
  import type { GraphMode } from '../domain/tree-selection';
  import { rememberCenter, rememberGraphState, readZoom, rememberZoom, readHourglassDepth, rememberHourglassDepth } from '../state/family';
  import ResponsivePanel from '../components/ResponsivePanel.svelte';
  import type { PanelLevel } from '../components/ResponsivePanel.svelte';
  import type { GraphSearch } from '../state/graph-search';
  import { navigate, type NavigationState } from '../state/navigation';
  import type { LayoutEngine } from '../domain/family-layout';
  import FamilyCanvas from '../components/FamilyCanvas.svelte';
  import AncestorFan from '../components/AncestorFan.svelte';
  import { fanDepth as clampFanDepth } from '../domain/ancestor-fan';
  import GraphViewSwitcher from '../components/GraphViewSwitcher.svelte';
  let { archive, session, route, onperson, onsearch, me = '' }: {
    me?: string;
    onsearch(value: GraphSearch): void; onperson(id: string): void; archive: ArchiveSnapshot; session: FamilySession; route: NavigationState;
  } = $props();
  const engine: LayoutEngine = 'typescript';
  let panelLevel = $state<PanelLevel>('collapsed');
  let panelHeight = $state(0);
  let dataset = $derived(session.dataset);
  let storage: Storage | undefined;
  try { storage = window.sessionStorage; } catch { /* View state is optional. */ }
  let zoomStorage: Storage | undefined;
  try { zoomStorage = window.localStorage; } catch { /* Optional zoom persistence. */ }
  let scale = $state(untrack(() => readZoom(archive.tree.id, zoomStorage, storage)));
  let fanDepth = $state(untrack(() => {
    try { const saved = storage?.getItem(`fanDepth:${archive.tree.id}`); return saved ? clampFanDepth(Number(saved)) : 5; } catch { return 5; }
  }));
  $effect(() => { try { storage?.setItem(`fanDepth:${archive.tree.id}`, String(fanDepth)); } catch { /* Optional preference. */ } });
  let hourglassDepth = $state(untrack(() => readHourglassDepth(archive.tree.id, storage)));
  let hourglassFit = $state(false);
  $effect(() => rememberHourglassDepth(archive.tree.id, hourglassDepth, storage));
  function changeHourglassDepth(event: Event) {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    if (value === hourglassDepth) return;
    hourglassFit = true;
    hourglassDepth = value;
  }
  function saveZoom(value: number) { scale = value; rememberZoom(value, zoomStorage); hourglassFit = false; }
  let center = $derived(route.person);
  let mode = $derived<GraphMode>(route.action === 'tree' ? 'hourglass' : ['family', 'hourglass', 'descendants', 'ancestors', 'connections'].includes(route.action) ? route.action as GraphMode : 'family');
  let roots = $derived(route.roots);
  let t = $derived(getT(archive.config.language));
  let activeCenter = $derived(dataset.people[center] ? center : dataset.meta.focusPersonId);
  let activeRoots = $derived([...new Set([activeCenter, ...roots.filter(id => dataset.people[id])])]);
  let maxHourglassDepth = $derived(mode === 'hourglass' ? Math.max(5, Number.isFinite(hourglassDepth) ? hourglassDepth : 5, hourglassMaxDepth(dataset.people, activeRoots)) : 5);
  let connections = $derived(mode === 'connections' ? selectConnections(dataset, route.connectEmpty ? [] : route.connect) : null);
  let descriptionsByPair = $derived(connections ? describeConnections(dataset, connections.selected, t) : []);
  let baseScene = $derived(mode === 'connections' ? {
    family: connections!.family,
    generations: connections!.family ? computeGenerations(dataset.people, new Set(connections!.family.people), connections!.family.center) : undefined,
  } : mode === 'ancestors' ? { family: null, generations: undefined } : selectGraph(dataset, activeCenter, mode, activeRoots, hourglassDepth));
  let expansionContext = $derived(JSON.stringify([mode, activeCenter, connections?.selected ?? activeRoots, mode === 'hourglass' ? String(hourglassDepth) : null]));
  let expansion = $state<{ context: string; steps: Expansion[] }>({ context: '', steps: [] });
  let steps = $derived(expansion.context === expansionContext ? expansion.steps : []);
  let scene = $derived({ ...baseScene, family: baseScene.family ? expandGraph(dataset, baseScene.family, steps) : null });
  $effect(() => { if (expansion.context !== expansionContext) expansion = { context: expansionContext, steps: [] }; });
  function expand(id: string, direction: Direction) {
    expansion = { context: expansionContext, steps: [...steps, { id, direction }] };
  }
  $effect(() => { if (connections) rememberConnections(archive.tree.id, connections.selected, storage); });
  $effect(() => rememberGraphState(archive.tree.id, { mode, roots: activeRoots }, storage));
  $effect(() => rememberCenter(archive.tree.id, activeCenter, storage));
  function changeMode(value: GraphMode) {
    navigate({ action: value === 'hourglass' ? 'tree' : value, info: '',
      ...(value === 'connections' && me ? { connect: [me], connectEmpty: false } : {}) });
  }
  function chooseCenter(id: string) {
    if (!Object.hasOwn(dataset.people, id)) return;
    navigate({ person: id, roots: [id], info: '', action: mode === 'connections' ? 'family' : route.action });
  }
  function addRoot(id: string) { navigate({ roots: [...new Set([...activeRoots, id])] }, { push: false }); }
  function setConnections(ids: string[]) { navigate({ connect: ids, connectEmpty: !ids.length }, { push: false }); }
  function showFamily(id: string) { navigate({ action: 'family', person: id, roots: [id], info: '' }); }
  function connectPair(from: string, to: string) { navigate({ action: 'connections', connect: [from, to], connectEmpty: false, info: '' }); panelLevel = 'collapsed'; }
  $effect(() => {
    onsearch({ mode, center: activeCenter, showFamily, connectPair, exclude: connections?.selected || [],
      choose: connections ? id => setConnections([...connections!.selected, id]) : chooseCenter,
      add: mode === 'hourglass' ? addRoot : undefined });
  });

</script>

<section class="family-view" class:connections-view={mode === 'connections'} aria-label={t.get(modeLabel[mode])} data-center={activeCenter} data-mode={mode} data-layout-engine={mode === 'ancestors' ? 'fan' : engine} style:--sheet-height={`${connections ? panelHeight : 0}px`}>
  <div class="graph-tools"><GraphViewSwitcher {mode} {t} onchange={changeMode} />
    {#if mode === 'hourglass'}<label class="fan-depth">{t.get('fanGenerations')} <select aria-label={t.get('fanGenerations')} value={hourglassDepth} onchange={changeHourglassDepth}>{#each Array.from({ length: maxHourglassDepth }, (_, i) => i + 1) as n}<option value={n}>{n}</option>{/each}<option value={Infinity} aria-label={t.get('hourglassAllGenerations')}>∞</option></select></label>{/if}
    {#if mode === 'ancestors'}<label class="fan-depth">{t.get('fanGenerations')} <select aria-label={t.get('fanGenerations')} bind:value={fanDepth}>{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n}<option value={n}>{n}</option>{/each}</select></label>{/if}
  </div>
  <div class="graph-workspace">
    <div class="graph-frame">
      {#if mode === 'hourglass' && activeRoots.length > 1}
        <div class="graph-roots hourglass-roots">{#each activeRoots as id}<button disabled={id === activeCenter} aria-label={t.get('graphRemoveRoot', { name: dataset.people[id].name || id })} onclick={() => navigate({ roots: roots.filter(root => root !== id) }, { push: false })}>{dataset.people[id].name || id}{id !== activeCenter ? ' ×' : ''}</button>{/each}</div>
      {/if}
      {#if mode === 'ancestors'}
        {#key `${activeCenter}:${fanDepth}`}<AncestorFan {dataset} center={activeCenter} depth={fanDepth} {t} onopen={onperson} />{/key}
      {:else if scene.family}
        {#key JSON.stringify([mode, activeCenter, connections?.selected ?? activeRoots, mode === 'hourglass' ? String(hourglassDepth) : null])}
          <FamilyCanvas {engine} onexpand={expand} family={scene.family} selectedIds={connections?.selected} generations={scene.generations} {mode} fitOnMount={mode === 'hourglass' && hourglassFit} initialScale={mode === 'hourglass' && hourglassFit ? undefined : scale} onscale={saveZoom} {dataset} assets={session.assets} {t} onopen={onperson} oncenter={chooseCenter} />
        {/key}
      {/if}
    </div>
    {#if connections}
      <ResponsivePanel id="connectionPanel" kind="connections" label={t.get('tabConnections')} {t} bind:level={panelLevel} collapsible onheight={height => panelHeight = height}>
        <div class="graph-roots connection-chips">{#each connections.selected as id}
          <button data-connection-selected={id} aria-label={t.get('connectionRemove', { name: dataset.people[id].name || id })} onclick={() => setConnections(connections!.selected.filter(other => other !== id))}>{dataset.people[id].name || id} ×</button>
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
