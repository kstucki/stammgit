<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { cardCamera } from '../state/card-camera';
  let { width, height, center, fitOnOpen, fitAxis = 'both', ready, t, children, initialScale, onscale }: {
    width: number; height: number; center: { x: number; y: number }; fitOnOpen: boolean; ready: boolean;
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
  $effect(() => {
    if (!viewport || !viewportWidth || !viewportHeight || !ready || initialized) return;
    initialized = true;
    untrack(() => {
      if (fitOnOpen && restoredScale === undefined) { void zoom(fitScale, true); return; }
      onscale(scale);
      const initial = { ...center };
      void tick().then(() => {
        if (viewport) { viewport.scrollLeft = initial.x * scale; viewport.scrollTop = initial.y * scale; }
      });
    });
  });
  async function zoom(next: number, fit = false) {
    if (!viewport) return;
    // Half-viewport padding makes scroll / scale the exact world coordinate
    // at the viewport center, even when the graph is smaller than the window.
    const x = fit ? (fitAxis === 'height' ? center.x : width / 2) : viewport.scrollLeft / scale;
    const y = fit ? height / 2 : viewport.scrollTop / scale;
    scale = Math.max(minimumScale, Math.min(3, next));
    onscale(scale);
    await tick();
    if (viewport) { viewport.scrollLeft = x * scale; viewport.scrollTop = y * scale; }
  }
</script>

<div class="graph-canvas">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can focus and scroll the graph.) -->
  <div bind:this={viewport} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight} use:cardCamera
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
