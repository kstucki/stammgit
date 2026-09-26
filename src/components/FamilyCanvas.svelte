<script lang="ts">
  import type { Dataset } from '../domain/person';
  import type { FamilySlice } from '../domain/family';
  import { layoutFamily, orderFamily, childPath, familyBridgePath, CARD_WIDTH, CARD_HEIGHT } from '../domain/family-layout';
  import GraphViewport from './GraphViewport.svelte';
  import type { FamilyOrder, LayoutEngine } from '../domain/family-layout';
  import { childConnection, partnerStyle, lineLabel } from '../domain/relationship-view';
  import { hiddenRelatives, type Direction } from '../domain/graph-expansion';
  import PersonCard from './PersonCard.svelte';
  let { family, dataset, assets, t, onopen, oncenter, generations, engine = 'typescript', mode = 'family', initialScale, onscale, selectedIds, onexpand }: {
    onexpand(id: string, direction: Direction): void; selectedIds?: string[]; family: FamilySlice; dataset: Dataset; assets: ReadonlyMap<string, string>;
    engine?: LayoutEngine; generations?: Map<string, number>; mode?: string; initialScale?: number; onscale(value: number): void;
    t: { get(key: string, values?: Record<string, string | number>): string };
    onopen(id: string): void; oncenter(id: string): void;
  } = $props();
  let hidden = $derived(hiddenRelatives(dataset, family));
  let heights = $state<ReadonlyMap<string, number>>(new Map());
  // Geometry is published with its exact selection. An editor command may
  // replace people/groups before the ordering effect or worker has run.
  let ordered = $state.raw<{ family: FamilySlice; order: FamilyOrder; engine: LayoutEngine } | null>(null);
  let error = $state(false);
  let retry = $state(0);
  $effect(() => {
    const source = family, selected = $state.snapshot(source), levels = generations, selectedEngine = engine;
    retry;
    error = false; ordered = null;
    if (selected.people.length < 80) { ordered = { family: source, engine: selectedEngine, order: orderFamily(selected, levels, selectedEngine) }; return; }
    const worker = new Worker(new URL('../domain/family-layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<FamilyOrder>) => { ordered = { family: source, engine: selectedEngine, order: event.data }; worker.terminate(); };
    worker.onerror = event => { event.preventDefault(); error = true; worker.terminate(); };
    worker.postMessage({ family: selected, generations: levels, engine: selectedEngine });
    return () => worker.terminate();
  });
  let layout = $derived(ordered?.family === family && ordered.engine === engine ? layoutFamily(family, heights, ordered.order) : null);
  function measure(node: HTMLElement, id: string) {
    const observer = new ResizeObserver(() => {
      const height = node.offsetHeight;
      if (height && heights.get(id) !== height) heights = new Map(heights).set(id, height);
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  let childNotes = $derived(family.people.map(child => ({ child, notes: family.groups.flatMap(group =>
    group.children.includes(child) ? childConnection(dataset, group.adults, child).annotations : []),
  })).filter(entry => entry.notes.length));
</script>

{#if error}
  <p role="alert">{t.get('graphLayoutFailed')} <button onclick={() => retry++}>{t.get('archiveRetry')}</button></p>
{:else if !layout}<p role="status">{t.get('loading')}</p>
{:else}
<GraphViewport initialFit={mode === 'family'} info={mode === 'connections' ? undefined : t.get(({ family: 'graphFamilyDescription', hourglass: 'graphHourglassDescription', descendants: 'graphDescendantsDescription', ancestors: 'graphAncestorsDescription' })[mode] || 'graphFamilyDescription')} width={layout.width} height={layout.height} {initialScale} {onscale} {t} fitAxis={mode === 'family' ? 'height' : 'both'} ready={family.people.every(id => heights.has(id))}
  center={{ x: layout.people.get(family.center)!.x + CARD_WIDTH / 2, y: layout.people.get(family.center)!.y + (heights.get(family.center) || CARD_HEIGHT) / 2 }}>
    <svg class="family-lines" width={layout.width} height={layout.height} aria-hidden="true">
      {#each family.groups as group}
        {@const anchor = layout.anchors.get(group.id)!}
        <g data-family-group={group.id}>
        {#if group.adults.length > 1}
            {@const style = group.partnership ? partnerStyle(dataset, group.adults[0], group.adults[1]) : 'default'}
            <path d={familyBridgePath(layout, group.id, group.adults)} class={`relation-${style}`} data-family-connection data-partnership={group.partnership || undefined}>
              {#if style !== 'default'}<title>{t.get(lineLabel[style])}</title>{/if}
            </path>
        {/if}
        {#each group.children as child}
            {@const connection = childConnection(dataset, group.adults, child)}
            <path d={childPath(layout, group.id, child)} class={`relation-${connection.style}`} data-parents={JSON.stringify(group.adults)} data-child={child}>
              {#if connection.style !== 'default'}<title>{t.get(lineLabel[connection.style])}</title>{/if}
            </path>
        {/each}
        {#if group.children.length > 0}
          <circle cx={anchor.x} cy={anchor.y} r="4" class="family-anchor" />
        {/if}
        </g>
      {/each}
    </svg>
    {#each childNotes as { child, notes }}
        {@const point = layout.people.get(child)!}
          <div class="family-line-notes" style:left={`${point.x}px`} style:top={`${point.y - notes.length * 22 - 6}px`} style:width={`${CARD_WIDTH}px`}>
            {#each notes as note}
              {@const label = `${t.get(lineLabel[note.style])}: ${dataset.people[note.parent].name || note.parent}`}
              <div class="family-line-note" title={label} data-relationship-note={child} data-parent={note.parent}>
                <svg width="20" height="14" aria-hidden="true"><path d="M 0 7 H 20" class={`relation-${note.style}`} /></svg><span>{label}</span>
              </div>
            {/each}
          </div>
    {/each}
    {#each family.people as id (id)}
      {@const point = layout.people.get(id)!}
      <div class="family-node" use:measure={id} style:left={`${point.x}px`} style:top={`${point.y}px`} style:width={`${CARD_WIDTH}px`}>
        <PersonCard hidden={hidden.get(id)!} onexpand={direction => onexpand(id, direction)} {id} person={dataset.people[id]} center={selectedIds ? selectedIds.includes(id) : id === family.center} marker={selectedIds ? t.get('connectionSelected') : undefined} centerAction={selectedIds ? t.get('showInTree') : undefined} {assets} {t} {onopen} {oncenter} />
      </div>
    {/each}
</GraphViewport>
{/if}
