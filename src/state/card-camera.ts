// Native scrolling and mouse dragging only. Zoom belongs to the visible controls.
export function cardCamera(viewport: HTMLElement) {
  const abort = new AbortController(), signal = abort.signal;
  let moved = false;
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  viewport.addEventListener('wheel', event => {
    // Trackpad pinch arrives as Ctrl-wheel in Chromium. Ordinary wheel events
    // keep their native two-axis scroll behavior, including momentum.
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false, signal });
  for (const type of ['gesturestart', 'gesturechange']) {
    viewport.addEventListener(type, event => event.preventDefault(), { passive: false, signal });
  }
  viewport.addEventListener('pointerdown', event => {
    moved = false;
    if (event.pointerType !== 'touch' && event.button === 0) {
      drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    }
  }, { signal });
  window.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) moved = true;
    if (moved) { viewport.scrollLeft = drag.left - dx; viewport.scrollTop = drag.top - dy; }
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(type, () => { drag = null; }, { signal });
  viewport.addEventListener('click', event => {
    if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; }
  }, { capture: true, signal });
  viewport.addEventListener('dragstart', event => event.preventDefault(), { signal });
  viewport.addEventListener('touchstart', event => {
    if (event.touches.length > 1) moved = true;
  }, { passive: true, signal });
  viewport.addEventListener('touchmove', event => {
    moved = true;
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false, signal });
  return { destroy: () => abort.abort() };
}
