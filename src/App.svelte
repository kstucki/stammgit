<script lang="ts">
  import { onMount } from 'svelte';
  import { getT } from '../public/assets/strings.js';
  import { loadArchive } from './data/archive';
  import { loadFamilySession } from './data/family';
  import { viewHref } from './domain/archive';
  import type { ArchiveState } from './state/archive';
  import ArchiveHome from './views/ArchiveHome.svelte';
  import { Workspace } from './state/workspace.svelte';
  import './workspace.css';
  let workspace = $state<Workspace | null>(null);

  let loadState = $state<ArchiveState>({ status: 'loading' });
  let controller: AbortController | undefined;
  function initialLanguage(): 'de' | 'en' {
    try {
      const saved = localStorage.getItem('archiveLanguage');
      if (saved === 'de' || saved === 'en') return saved;
    } catch { /* Language persistence is optional. */ }
    return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'de';
  }
  let language = $state<'de' | 'en'>(initialLanguage());
  let fallbackStrings = $derived(getT(language));

  async function load() {
    controller?.abort();
    workspace?.dispose(); workspace = null;
    const request = controller = new AbortController();
    loadState = { status: 'loading' };
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Browsing still works without local drafts. */ }
    try {
      const archive = await loadArchive({ storage, cookie: document.cookie, signal: request.signal });
      if (request.signal.aborted) return;
      language = archive.config.language === 'en' ? 'en' : 'de';
      document.documentElement.lang = language;
      try { storage?.setItem('archiveLanguage', language); } catch { /* Optional persistence. */ }
      const session = await loadFamilySession(archive, { storage, signal: request.signal });
      if (request.signal.aborted) return;
      const store = new Workspace(archive, session);
      await store.initialize();
      if (request.signal.aborted) { store.dispose(); return; }
      workspace = store;
      document.documentElement.lang = archive.config.language === 'en' ? 'en' : 'de';
      document.title = archive.config.title;
      loadState = { status: 'ready' };
    } catch {
      if (!request.signal.aborted) loadState = { status: 'error' };
    }
  }

  onMount(() => {
    void load();
    // Each document has one workspace owner; restored pages reload current drafts.
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    window.addEventListener('pageshow', restore);
    return () => {
      controller?.abort();
      workspace?.dispose();
      window.removeEventListener('pageshow', restore);
    };
  });
</script>

{#if loadState.status === 'ready' && workspace}
  {#key workspace}<ArchiveHome store={workspace} />{/key}
{:else}
  <main class="archive-shell" aria-busy={loadState.status === 'loading'}>
    {#if loadState.status === 'loading'}
      <p role="status">{fallbackStrings.get('loading')}</p>
    {:else}
      <h1>{fallbackStrings.get('archiveLoadFailed')}</h1>
      <p role="alert">{fallbackStrings.get('archiveLoadHint')}</p>
      <div class="actions">
        <button onclick={load}>{fallbackStrings.get('archiveRetry')}</button>
        <a href={viewHref('overview')}>{fallbackStrings.get('archiveTree')}</a>
      </div>
    {/if}
  </main>
{/if}
