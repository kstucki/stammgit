// Full-document section navigation keeps normal browser Back/Forward semantics.
// Restore after asynchronous chapter content, rather than before its height exists.
export function rememberPagePosition() {
  history.replaceState({ ...history.state, archiveScroll: { x: scrollX, y: scrollY } }, '');
}
export async function restorePagePosition() {
  const position = history.state?.archiveScroll;
  if (!position || !Number.isFinite(position.y)) return;
  const href = location.href;
  await Promise.allSettled([...document.querySelectorAll<HTMLImageElement>('.chronicle-chapter img')].map(img => img.decode()));
  requestAnimationFrame(() => { if (location.href === href && history.state?.archiveScroll?.y === position.y) window.scrollTo(position.x || 0, position.y); });
}
export function navigateFromContent(href: string) {
  rememberPagePosition();
  location.assign(href);
}
