import { writable } from 'svelte/store';
export interface NavigationState {
  view: string; person: string; action: string; info: string; language: string;
  chapter: string; section: string; connect: string[]; roots: string[]; connectEmpty: boolean;
}
export function readState(url: URL): NavigationState {
  const p = url.searchParams;
  let view = p.get('view') || (p.has('chapter') ? 'chronicle' : 'family');
  let action = p.get('action') || '';
  if (view === 'connections') { view = 'family'; action = 'connections'; }
  if (view === 'overview') { view = 'family'; action ||= 'tree'; }
  if (['hourglass', 'descendants', 'ancestors'].includes(view)) { action = view === 'hourglass' ? 'tree' : view; view = 'family'; }
  return { view, action, person: action === 'person' ? '' : p.get('person') || '',
    info: p.get('info') || (action === 'person' ? p.get('person') || '' : ''), language: p.get('language') || '',
    chapter: p.get('chapter') || '', section: url.hash.slice(1), connect: p.getAll('connect'), roots: p.getAll('root'), connectEmpty: p.has('connectEmpty') };
}
export function stateUrl(state: NavigationState, base: URL): URL {
  const url = new URL(base);
  for (const key of ['view', 'person', 'action', 'info', 'language', 'chapter', 'connect', 'connectEmpty', 'root']) url.searchParams.delete(key);
  for (const key of ['view', 'person', 'language'] as const) url.searchParams.set(key, state[key]);
  if (state.action) url.searchParams.set('action', state.action);
  if (state.info) url.searchParams.set('info', state.info);
  if (state.view === 'chronicle') url.searchParams.set('chapter', state.chapter);
  for (const id of state.connect) url.searchParams.append('connect', id);
  for (const id of state.roots) url.searchParams.append('root', id);
  if (state.connectEmpty) url.searchParams.set('connectEmpty', '1');
  url.hash = state.section; return url;
}
export const navigation = writable<NavigationState>(readState(new URL('https://local/')));
export function rememberNavigationState(values: Record<string, unknown>) {
  history.replaceState({ ...history.state, ...values }, '');
}
export function navigate(patch: Partial<NavigationState>, { push = true }: { push?: boolean } = {}) {
  const previous = readState(new URL(location.href)), next = { ...previous, ...patch };
  const url = stateUrl(next, new URL(location.href));
  if (url.href !== location.href) {
    if (push) {
      rememberNavigationState({ archiveScroll: { x: scrollX, y: scrollY } });
      const samePage = next.view === previous.view && next.chapter === previous.chapter;
      const samePanelView = samePage && next.person === previous.person && next.action === previous.action;
      const previousDepth = Number.isSafeInteger(history.state?.infoDepth) ? history.state.infoDepth : 0;
      const infoDepth = next.info && samePanelView ? (previous.info ? previousDepth : 0) + 1 : 0;
      history.pushState({ ...(samePage && next.info ? history.state : {}), appNavigation: true, infoEntry: !!next.info, infoPrevious: !!previous.info, infoDepth }, '', url);
    } else history.replaceState(history.state, '', url);
  }
  navigation.set(next);
}
let closingInfo = false;
function clearPersonInfo() {
  rememberNavigationState({ infoEntry: false, infoPrevious: false, infoDepth: 0 });
  navigate({ info: '' }, { push: false });
}
export function closePersonInfo() {
  if (closingInfo || !readState(new URL(location.href)).info) return;
  const depth = history.state?.infoDepth;
  if (Number.isSafeInteger(depth) && depth > 0 && depth < history.length) {
    closingInfo = true;
    history.go(-depth);
  } else clearPersonInfo();
}
export function navigateHref(href: string) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || url.pathname !== '/') { location.assign(href); return; }
  const state = readState(url), current = readState(new URL(location.href));
  navigate({ ...state, person: state.person || current.person, language: state.language || current.language,
    action: state.action === 'person' ? current.action : state.action || current.action,
    roots: state.roots.length ? state.roots : state.person ? [state.person] : current.roots,
    connect: url.searchParams.has('connect') || state.connectEmpty ? state.connect : current.connect,
    connectEmpty: url.searchParams.has('connect') ? false : state.connectEmpty || current.connectEmpty });
}
export function listenNavigation() {
  const pop = () => {
    if (closingInfo) {
      closingInfo = false;
      // A copied info link may be the first entry of the chain: close it too.
      clearPersonInfo();
    } else navigation.set(readState(new URL(location.href)));
  };
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const a = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin || url.pathname !== '/' || !url.searchParams.has('view') && url.hash) return;
    if (url.searchParams.get('action') === 'edit' || url.searchParams.get('view') === 'admin') return;
    event.preventDefault(); navigateHref(a.href);
  };
  window.addEventListener('popstate', pop); document.addEventListener('click', click);
  return () => { closingInfo = false; window.removeEventListener('popstate', pop); document.removeEventListener('click', click); };
}
