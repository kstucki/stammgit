// Preserve saved person actions, chapter languages and section anchors.
const target = new URL('/', location.origin);
target.search = location.search;
target.hash = location.hash;
if (!target.searchParams.has('view')) {
  target.searchParams.set('view', target.searchParams.has('chapter') ? 'chronicle' : 'overview');
}
location.replace(target.pathname + target.search + target.hash);
