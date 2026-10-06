// Source identity stays the original URL; only the displayed file is localized.
export function sourceBase(url: string): string {
  return /^\/sources\/[^/?#]+\.(?:pt|en)\.pdf(?:[?#]|$)/.test(url) ? url.replace(/\.(?:pt|en)\.pdf(?=[?#]|$)/, '.pdf') : url;
}
export function sourceVariant(url: string, language = 'pt'): string | undefined {
  const base = sourceBase(url), code = language.split('-')[0];
  if (code !== 'pt' && code !== 'en') return undefined;
  return /^\/sources\/[^/?#]+\.pdf(?:[?#]|$)/.test(base) ? base.replace(/\.pdf(?=[?#]|$)/, `.${code}.pdf`) : undefined;
}
export function localizedSource(url: string, language: string | undefined, available: ReadonlySet<string>): string {
  const base = sourceBase(url), variant = sourceVariant(base, language || 'de');
  return variant && available.has(variant.split(/[?#]/)[0]) ? variant : base;
}
export function availableSources(published: readonly string[], assets: ReadonlyMap<string, string>, deletions: readonly string[]): ReadonlySet<string> {
  const files = new Set([...published, ...assets.keys()].filter(url => url.startsWith('/sources/')));
  for (const name of deletions) files.delete(`/sources/${name}`);
  return files;
}
