// Native scrolling/mouse dragging, with pinch delegated to the shared zoom owner.
interface PinchZoom { getScale(): number; zoom(scale: number, anchor: { x: number; y: number }): void }
export function cardCamera(viewport: HTMLElement, zoom?: PinchZoom) {
  const abort = new AbortController(), signal = abort.signal;
  let moved = false;
  let pinch: { distance: number; scale: number } | null = null;
  let gestureScale = 1;
  const anchor = (x: number, y: number) => { const r = viewport.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
  const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  viewport.addEventListener('wheel', event => {
    // Trackpad pinch arrives as Ctrl-wheel in Chromium. Ordinary wheel events
    // keep their native two-axis scroll behavior, including momentum.
    if (event.ctrlKey) { event.preventDefault(); zoom?.zoom(zoom.getScale() * Math.exp(-event.deltaY * .01), anchor(event.clientX, event.clientY)); }
  }, { passive: false, signal });
  viewport.addEventListener('gesturestart', event => { event.preventDefault(); gestureScale = zoom?.getScale() || 1; }, { passive: false, signal });
  viewport.addEventListener('gesturechange', event => {
    event.preventDefault(); const gesture = event as Event & { scale: number; clientX: number; clientY: number };
    if (!pinch) zoom?.zoom(gestureScale * gesture.scale, anchor(gesture.clientX, gesture.clientY));
  }, { passive: false, signal });
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
    if (event.touches.length === 2) {
      moved = true; event.preventDefault();
      pinch = { distance: distance(event.touches), scale: zoom?.getScale() || 1 };
    }
  }, { passive: false, signal });
  viewport.addEventListener('touchmove', event => {
    moved = true;
    if (event.touches.length === 2) {
      event.preventDefault();
      if (pinch && pinch.distance) zoom?.zoom(pinch.scale * distance(event.touches) / pinch.distance,
        anchor((event.touches[0].clientX + event.touches[1].clientX) / 2, (event.touches[0].clientY + event.touches[1].clientY) / 2));
    }
  }, { passive: false, signal });
  for (const type of ['touchend', 'touchcancel']) viewport.addEventListener(type, () => { pinch = null; }, { signal });
  return { update(value: PinchZoom) { zoom = value; }, destroy: () => abort.abort() };
}
