<script lang="ts">
  import { tick, untrack, onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { cardCamera } from '../state/card-camera';
  let { width, height, center, initialFit = false, info, fitAxis = 'both', ready, t, children, initialScale, onscale }: {
    initialFit?: boolean; info?: string; width: number; height: number; center: { x: number; y: number }; ready: boolean;
    fitAxis?: 'height' | 'both'; initialScale?: number; onscale(value: number): void;
    t: { get(key: string): string }; children: Snippet;
  } = $props();
  let viewport = $state<HTMLDivElement>();
  let viewportWidth = $state(0), viewportHeight = $state(0);
  const restoredScale = untrack(() => initialScale);
  let scale = $state(restoredScale ?? 1);
  let fitScale = $derived(Math.min(1, fitAxis === 'height' ? Infinity : Math.max(1, viewportWidth - 24) / width, Math.max(1, viewportHeight - 24) / height));
  let minimumScale = $derived(Math.min(.08, fitScale));
  let initialized = false;
  let fontsReady = $state(false);
  onMount(() => { let active = true; void document.fonts.ready.then(() => requestAnimationFrame(() => { if (active) fontsReady = true; })); return () => { active = false; }; });
  $effect(() => {
    if (!viewport || !viewportWidth || !viewportHeight || !ready || !fontsReady || initialized) return;
    initialized = true;
    untrack(() => {
      if (initialFit && restoredScale === undefined) {
        void zoom(Math.min(1, (viewportWidth - 24) / width, (viewportHeight - 24) / height), true, undefined, true);
        return;
      }
      onscale(scale);
      const initial = { ...center };
      void tick().then(() => {
        if (viewport) { viewport.scrollLeft = initial.x * scale; viewport.scrollTop = initial.y * scale; }
      });
    });
  });
  async function zoom(next: number, fit = false, anchor?: { x: number; y: number }, both = false) {
    if (!viewport || !Number.isFinite(next)) return;
    // Half-viewport padding makes scroll / scale the exact world coordinate
    // at the viewport center, even when the graph is smaller than the window.
    const x = anchor ? (viewport.scrollLeft + anchor.x - viewportWidth / 2) / scale : fit ? (fitAxis === 'height' && !both ? center.x : width / 2) : viewport.scrollLeft / scale;
    const y = anchor ? (viewport.scrollTop + anchor.y - viewportHeight / 2) / scale : fit ? height / 2 : viewport.scrollTop / scale;
    scale = Math.max(fit ? Math.min(minimumScale, next) : minimumScale, Math.min(3, next));
    onscale(scale);
    await tick();
    if (viewport) { viewport.scrollLeft = x * scale + (anchor ? viewportWidth / 2 - anchor.x : 0); viewport.scrollTop = y * scale + (anchor ? viewportHeight / 2 - anchor.y : 0); }
  }
</script>

<div class="graph-canvas">
{#if info}<details class="graph-info"><summary aria-label={t.get('graphInfo')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg></summary><p>{info}</p></details>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can focus and scroll the graph.) -->
  <div bind:this={viewport} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight} use:cardCamera={{ getScale: () => scale, zoom: (next, anchor) => void zoom(next, false, anchor) }}
    class="family-viewport" tabindex="0" role="region" aria-label={t.get('familyDiagram')}>
    <div class="family-surface" style:width={`${width * scale + viewportWidth}px`} style:height={`${height * scale + viewportHeight}px`}>
      <div class="family-plane" style:left={`${viewportWidth / 2}px`} style:top={`${viewportHeight / 2}px`}
        style:width={`${width}px`} style:height={`${height}px`} style:transform={`scale(${scale})`}>
        {@render children()}
      </div>
    </div>
  </div>
  <div class="graph-zoom" role="group" aria-label={t.get('graphZoomControls')}>
    <button type="button" onclick={() => zoom(scale / 1.2)} disabled={scale <= minimumScale} aria-label={t.get('graphZoomOut')} title={t.get('graphZoomOut')}>−</button>
    <output aria-label={t.get('graphZoomLevel')} data-zoom-level>{Math.round(scale * 1000) / 10} %</output>
    <button type="button" onclick={() => zoom(scale * 1.2)} disabled={scale >= 3} aria-label={t.get('graphZoomIn')} title={t.get('graphZoomIn')}>+</button>
    <button type="button" class="graph-fit" onclick={() => zoom(fitScale, true)}>{t.get('graphFit')}</button>
  </div>
</div>
