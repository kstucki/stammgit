<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  export type PanelLevel = 'collapsed' | 'half' | 'full';
  let { id, kind, label, labelledby, level = $bindable('half'), collapsible = false, children, onclose, onheight, t }: {
    id: string; kind: 'person' | 'connections'; label?: string; labelledby?: string;
    level?: PanelLevel; collapsible?: boolean; children: Snippet;
    onclose?(): void; onheight?(height: number): void; t: { get(key: string): string };
  } = $props();
  let panel: HTMLElement, measured = $state(0), dragHeight = $state<number | null>(null);
  let dragged = false;
  let drag: { y: number; height: number; pointer: number } | null = null;
  let levels = $derived<PanelLevel[]>(collapsible ? ['collapsed', 'half', 'full'] : ['half', 'full']);
  $effect(() => { onheight?.(measured); });
  function toggle() { if (dragged) { dragged = false; return; } level = levels[(levels.indexOf(level) + 1) % levels.length]; }
  function start(event: PointerEvent) {
    if (!matchMedia('(max-width: 899px)').matches) return;
    dragged = false;
    drag = { y: event.clientY, height: panel.offsetHeight, pointer: event.pointerId };
    // Capture on the button so a simple tap still reaches its click handler.
    (event.currentTarget as HTMLElement).querySelector('button')!.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (drag?.pointer === event.pointerId) dragHeight = Math.max(80, Math.min(innerHeight - 110, drag.height + drag.y - event.clientY));
  }
  function end(event: PointerEvent) {
    if (!drag) return;
    const delta = drag.y - event.clientY;
    if (Math.abs(delta) > 25) {
      dragged = true;
      level = levels[Math.max(0, Math.min(levels.length - 1, levels.indexOf(level) + (delta > 0 ? 1 : -1)))];
    }
    drag = null; dragHeight = null;
  }
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && onclose && !event.defaultPrevented) { event.preventDefault(); onclose(); } };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); if (kind === 'person' && previous?.isConnected) previous.focus({ preventScroll: true }); };
  });
</script>
<aside {id} bind:this={panel} bind:clientHeight={measured} class={`responsive-panel ${kind}-panel`} data-panel-level={level}
  role={kind === 'person' ? 'dialog' : 'region'} aria-modal={kind === 'person' ? 'false' : undefined} aria-label={label} aria-labelledby={labelledby}
  style:--drag-height={dragHeight === null ? undefined : `${dragHeight}px`}>
  <div class="panel-grip" onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={() => { drag = null; dragHeight = null; }} role="presentation">
    <button type="button" data-sheet-toggle onclick={toggle} aria-label={t.get(level === 'full' ? 'panelReduce' : 'panelExpand')}><span></span></button>
  </div>
  {#if onclose}<button class="dialog-close panel-close" onclick={onclose} aria-label={t.get('close')}>×</button>{/if}
  <div class="panel-body">{@render children()}</div>
</aside>
