<script lang="ts">
  import { graphModes } from '../domain/tree-selection';
  import type { GraphMode } from '../domain/tree-selection';
  let { mode = $bindable(), t }: { mode: GraphMode; t: { get(key: string): string } } = $props();
  const labels: Record<GraphMode, string> = {
    family: 'graphFamilyShort', hourglass: 'graphHourglassShort', descendants: 'graphDescendantsShort',
    ancestors: 'graphAncestorsShort', connections: 'tabConnections',
  };
</script>

<div class="graph-view-switcher" role="radiogroup" aria-label={t.get('graphView')}>
  {#each graphModes as value}
    <label class="graph-mode">
      <input type="radio" name="graph-mode" aria-label={t.get(labels[value]).replace(/\s+/g, ' ')} {value} bind:group={mode} />
      <span class="graph-mode-face">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if value === 'family'}
            <path d="M7 5l3.5 5M17 5l-3.5 5M7 19l3.5-5M17 19l-3.5-5M14 12h5" />
            <circle cx="6" cy="4" r="2" /><circle cx="18" cy="4" r="2" />
            <circle cx="6" cy="20" r="2" /><circle cx="18" cy="20" r="2" /><circle cx="21" cy="12" r="2" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          {:else if value === 'hourglass'}
            <path d="M4 3h16c0 4-8 6-8 9s8 5 8 9H4c0-4 8-6 8-9S4 7 4 3M12 3v18" />
            <g fill="currentColor">
              <circle cx="4" cy="3" r="1.25" /><circle cx="12" cy="3" r="1.25" /><circle cx="20" cy="3" r="1.25" />
              <circle cx="4" cy="21" r="1.25" /><circle cx="12" cy="21" r="1.25" /><circle cx="20" cy="21" r="1.25" />
              <circle cx="12" cy="12" r="2" />
            </g>
          {:else if value === 'descendants' || value === 'ancestors'}
            <g transform={value === 'ancestors' ? 'rotate(180 12 12)' : undefined}>
              <path d="M12 6.5V12M4 17v-5h16v5M12 12v5" />
              <circle cx="12" cy="4" r="2.5" fill="currentColor" />
              <circle cx="4" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="20" cy="19" r="2" />
            </g>
          {:else if value === 'connections'}
            <path d="M5 6H19L5 18H19" />
            <circle cx="5" cy="6" r="2" fill="currentColor" /><circle cx="19" cy="18" r="2" fill="currentColor" />
            <circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" />
          {/if}
        </svg>
        <span>{t.get(labels[value])}</span>
      </span>
    </label>
  {/each}
</div>
