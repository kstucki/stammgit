<script lang="ts">
  import { displayPersonName, type Dataset } from '../domain/person';
  import { formatLifespan } from '../domain/dates';
  import { ancestorFan, fanGeometry, fanNameLines, FAN_CORE, FAN_RING, FAN_PAD } from '../domain/ancestor-fan';
  import GraphViewport from './GraphViewport.svelte';
  let { dataset, center, depth, t, onopen }: {
    dataset: Dataset; center: string; depth: number;
    t: { locale?: string; get(key: string, values?: Record<string, unknown>): string }; onopen(id: string): void;
  } = $props();
  let slots = $derived(ancestorFan(dataset, center, depth));
  let radius = $derived(FAN_CORE + FAN_RING * depth);
  let width = $derived(2 * (radius + FAN_PAD)), height = $derived(radius + FAN_CORE + 2 * FAN_PAD);
  let known = $derived(slots.filter(slot => slot.generation && slot.id).length);
  let issues = $derived(slots.filter(slot => slot.issue));
  function open(event: KeyboardEvent, id: string) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onopen(id); } }
</script>

<div class="ancestor-fan" data-fan-depth={depth}>
  <p class="fan-summary" aria-live="polite">{t.get('fanCoverage', { known, total: slots.length - 1 })}</p>
  {#if issues.length}<p class="fan-warning" role="status">{t.get('fanIssues')} {#each issues as slot}<button onclick={() => onopen(slot.id!)}>{dataset.people[slot.id!].name || slot.id}</button>{/each}</p>{/if}
  <GraphViewport initialFit={true} {width} {height} center={{ x: width / 2, y: radius + FAN_PAD }} ready={true} {t} info={t.get('graphAncestorsDescription')}>
    <svg class="fan-svg" {width} {height} viewBox={`0 0 ${width} ${height}`} aria-label={t.get('graphAncestors')}>
      <g transform={`translate(${width / 2},${radius + FAN_PAD})`}>
        {#each slots as slot (slot.number)}
          {@const person = slot.id ? dataset.people[slot.id] : undefined}
          {@const geometry = slot.generation ? fanGeometry(slot.generation, slot.index) : null}
          {@const name = person?.name || slot.id || t.get('fanUnknown')}
          {@const dates = person ? formatLifespan(person, t.locale, 'card') : ''}
          {@const lines = fanNameLines(displayPersonName(person, name), geometry?.narrow)}
          {@const label = `${name}${dates ? ', ' + dates : ''}`}
          {#if person && slot.id}
            <g class="fan-person" class:fan-center={!slot.generation} class:fan-untyped={slot.unknownType} data-fan-person={slot.id} data-fan-slot={slot.number}
              role="button" tabindex="0" aria-label={label} onclick={() => onopen(slot.id!)} onkeydown={event => open(event, slot.id!)}>
              <title>{label}</title>
              {#if geometry}<path d={geometry.path} class:fan-alternate={slot.index >= 2 ** (slot.generation - 1)} />{:else}<circle r={FAN_CORE} />{/if}
              <g transform={geometry ? `translate(${geometry.x},${geometry.y}) rotate(${geometry.rotation})` : undefined} class="fan-label">
                <text text-anchor="middle" dominant-baseline="middle">
                  {#each lines as line, i}<tspan x="0" y={(i - (lines.length - 1) / 2) * 17 - (!geometry?.narrow && dates ? 8 : 0)}>{line}</tspan>{/each}
                </text>
                {#if dates && !geometry?.narrow}<text class="fan-dates" text-anchor="middle" y={lines.length * 8 + 10}>{dates}</text>{/if}
              </g>
            </g>
          {:else if geometry}
            <path class="fan-empty" data-fan-slot={slot.number} d={geometry.path}><title>{t.get('fanUnknown')}</title></path>
          {/if}
        {/each}
      </g>
    </svg>
  </GraphViewport>
</div>
