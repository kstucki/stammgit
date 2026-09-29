/** Visible rectangle after fixed/overlaid panels; graph coordinates stay unchanged. */
export function visibleArea(view: DOMRect, panels: DOMRect[]) {
  let width = view.width, height = view.height;
  for (const panel of panels) {
    if (panel.right <= view.left || panel.left >= view.right || panel.bottom <= view.top || panel.top >= view.bottom) continue;
    if (panel.width >= view.width * .8 && panel.bottom >= view.bottom - 1) height = Math.min(height, Math.max(0, panel.top - view.top));
    else if (panel.right >= view.right - 1 && panel.height >= view.height * .8) width = Math.min(width, Math.max(0, panel.left - view.left));
  }
  return { width, height };
}
export function readableScale(fit: number, baseFont: number) {
  return Math.max(fit, 12 / (baseFont > 0 ? baseFont : 16));
}
