<script lang="ts">
  import { tick, untrack, onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { visibleArea, readableScale } from '../state/viewport-area';
  import { cardCamera } from '../state/card-camera';
  let { width, height, center, anchorPoint, initialFit = false, info, ready, t, children, initialScale, onscale }: {
    anchorPoint?: { x: number; y: number };
    initialFit?: boolean; info?: string; width: number; height: number; center: { x: number; y: number }; ready: boolean;
    initialScale?: number; onscale?(value: number): void;
    t: { get(key: string): string }; children: Snippet;
  } = $props();
  let viewport = $state<HTMLDivElement>();
  let viewportWidth = $state(0), viewportHeight = $state(0);
  const restoredScale = untrack(() => initialScale);
  let scale = $state(restoredScale ?? 1);
  let displayedScale = $state(restoredScale ?? 1), cameraReady = $state(false);
  let available = $state({ width: 0, height: 0 });
  let fitScale = $derived(Math.min(1, Math.max(1, available.width - 24) / width, Math.max(1, available.height - 24) / height));
  // A fit from a larger graph may be below this scene’s usual lower bound.
  // Restoring it must not turn the next small zoom step into a jump.
  let minimumScale = $derived(Math.min(.08, fitScale, restoredScale ?? 1));
  let initialized = false, alive = true, operation = 0;
  let fontsReady = $state(false);
  let savedAnchor: { x: number; y: number } | null = null;
  export function preserveAnchor(point: { x: number; y: number }) {
    if (!viewport || !initialized) return;
    operation++;
    savedAnchor = {
      x: point.x * scale + viewportWidth - viewport.scrollLeft,
      y: point.y * scale + viewportHeight - viewport.scrollTop,
    };
  }
  function releaseAnchor() { savedAnchor = null; }
  // Run before painting the new geometry, including later card-height updates.
  // The captured screen coordinate survives asynchronous worker layouts.
  $effect.pre(() => {
    const point = anchorPoint;
    width; height;
    if (!point) return;
    untrack(() => {
      if (!savedAnchor || !viewport) return;
      const anchor = savedAnchor, request = ++operation;
      void tick().then(() => {
        if (!alive || !viewport || savedAnchor !== anchor || request !== operation) return;
        viewport.scrollLeft = point.x * scale + viewportWidth - anchor.x;
        viewport.scrollTop = point.y * scale + viewportHeight - anchor.y;
        displayedScale = scale; cameraReady = true;
      });
    });
  });
  async function place(point: { x: number; y: number }, anchor = { x: available.width / 2, y: available.height / 2 }) {
    const request = ++operation;
    await tick();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (alive && viewport && request === operation) {
      viewport.scrollLeft = point.x * scale + viewportWidth - anchor.x;
      viewport.scrollTop = point.y * scale + viewportHeight - anchor.y;
      displayedScale = scale; cameraReady = true;
    }
  }
  onMount(() => {
    alive = true;
    const input = new AbortController();
    for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
      viewport?.addEventListener(type, releaseAnchor, { passive: true, signal: input.signal });
    }
    const measure = () => {
      if (!viewport) return;
      const panels = [...document.querySelectorAll<HTMLElement>('.responsive-panel')];
      for (const panel of panels) resize.observe(panel);
      const rect = viewport.getBoundingClientRect();
      const next = visibleArea(new DOMRect(rect.left, rect.top, viewport.clientWidth, viewport.clientHeight), panels.map(p => p.getBoundingClientRect()));
      if (Math.abs(next.width - available.width) < .5 && Math.abs(next.height - available.height) < .5) return;
      available = next;
      // Panel changes only inform future explicit zoom/fit actions.
      // Opening, resizing or closing information must never move the graph.
    };
    const resize = new ResizeObserver(measure);
    if (viewport) resize.observe(viewport);
    const panels = new MutationObserver(measure);
    panels.observe(document.body, { childList: true, subtree: true });
    void document.fonts.ready.then(() => requestAnimationFrame(() => { if (alive) { measure(); fontsReady = true; } }));
    return () => { alive = false; operation++; input.abort(); resize.disconnect(); panels.disconnect(); };
  });
  $effect(() => {
    if (!viewport || !viewportWidth || !viewportHeight || !ready || !fontsReady || initialized) return;
    initialized = true;
    untrack(() => {
      const overview = initialFit && restoredScale === undefined;
      if (restoredScale === undefined) {
        const fitted = Math.min(1, (available.width - 24) / width, (available.height - 24) / height);
        const labels = [...viewport!.querySelectorAll<HTMLElement>('.person-card-text strong, .person-years, .person-open, .fan-center text')];
        const baseFont = Math.min(...labels.map(el => parseFloat(getComputedStyle(el).fontSize)).filter(n => n > 0), 16);
        scale = readableScale(Math.max(.01, fitted), baseFont);
        if (overview) scale = fitScale;
      }
      // One callback owns the current card zoom, including its first fitted value.
      // The fan has no callback and never changes the shared preference.
      onscale?.(scale);
      // Read center only after measured card heights and fonts have settled.
      void place(overview ? { x: width / 2, y: height / 2 } : { ...center });
    });
  });
  async function zoom(next: number, fit = false, anchor?: { x: number; y: number }) {
    if (!viewport || !initialized || !Number.isFinite(next)) return;
    releaseAnchor();
    const target = anchor || { x: available.width / 2, y: available.height / 2 };
    const point = fit ? { x: width / 2, y: height / 2 } : {
      x: (viewport.scrollLeft + target.x - viewportWidth) / scale,
      y: (viewport.scrollTop + target.y - viewportHeight) / scale,
    };
    scale = Math.max(fit ? Math.min(minimumScale, next) : minimumScale, Math.min(3, next));
    cameraReady = false;
    onscale?.(scale);
    await place(point, target);
  }

</script>

<div class="graph-canvas">
{#if info}<details class="graph-info"><summary aria-label={t.get('graphInfo')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg></summary><p>{info}</p></details>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can focus and scroll the graph.) -->
  <div bind:this={viewport} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight} use:cardCamera={{ getScale: () => scale, zoom: (next, anchor) => void zoom(next, false, anchor) }}
    class="family-viewport" style:overflow-anchor="none" tabindex="0" role="region" aria-label={t.get('familyDiagram')}>
    <div class="family-surface" style:width={`${width * scale + 2 * viewportWidth}px`} style:height={`${height * scale + 2 * viewportHeight}px`}>
      <div class="family-plane" style:left={`${viewportWidth}px`} style:top={`${viewportHeight}px`}
        style:width={`${width}px`} style:height={`${height}px`} style:transform={`scale(${scale})`}>
        {@render children()}
      </div>
    </div>
  </div>
  <div class="graph-zoom" role="group" aria-label={t.get('graphZoomControls')}>
    <button type="button" onclick={() => zoom(scale / 1.2)} disabled={!cameraReady || scale <= minimumScale} aria-label={t.get('graphZoomOut')} title={t.get('graphZoomOut')}>−</button>
    <output aria-label={t.get('graphZoomLevel')} data-zoom-level>{Math.round(displayedScale * 1000) / 10} %</output>
    <button type="button" onclick={() => zoom(scale * 1.2)} disabled={!cameraReady || scale >= 3} aria-label={t.get('graphZoomIn')} title={t.get('graphZoomIn')}>+</button>
    <button type="button" class="graph-fit" disabled={!cameraReady} onclick={() => zoom(fitScale, true)}>{t.get('graphFit')}</button>
  </div>
</div>
