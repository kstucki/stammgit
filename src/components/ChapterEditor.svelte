<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import type { ChronicleIndex } from '../domain/person';
  import { parseChapter } from '../../public/assets/chronicle.js';
  import { sourceDocuments } from '../domain/sources';
  import { chapterText, chapterCandidate, stageChapter } from '../data/chronicle';
  import { freeResize } from '../data/images.js';
  import ChapterContent from './ChapterContent.svelte';
  let { store, file, chapters, ondone, oncancel, onperson }: { store: Workspace; file: string; chapters: ChronicleIndex; ondone(file: string): void; oncancel(): void; onperson(id: string): void } = $props();
  let title = $state(''), date = $state(''), body = $state(''), unsourced = $state(false), loading = $state(true), busy = $state(false), status = $state(''), preview = $state(false);
  let personQuery = $state(''), source = $state(''), photos = $state<FileList>(), area: HTMLTextAreaElement;
  let documents = $derived(sourceDocuments(store.dataset.people));
  let matches = $derived(personQuery.trim() ? Object.keys(store.dataset.people).filter(id => (store.dataset.people[id].name || id).toLowerCase().includes(personQuery.trim().toLowerCase())).sort((a, b) => (store.dataset.people[a].name || a).localeCompare(store.dataset.people[b].name || b)).slice(0, 8) : []);
  onMount(() => {
    const controller = new AbortController();
    async function load() {
      try { if (file) { const parsed = parseChapter(await chapterText(store.tree, file, controller.signal)); if (controller.signal.aborted) return; title = parsed.frontmatter.title || ''; date = parsed.frontmatter.date || ''; unsourced = parsed.frontmatter.unsourced === 'true'; body = parsed.body.trim(); } loading = false; }
      catch (error) { if (!controller.signal.aborted) status = store.t.get('chronicleLoadFailed'); }
    }
    void load(); return () => controller.abort();
  });
  async function insert(text: string) {
    const start = area.selectionStart ?? body.length, end = area.selectionEnd ?? start;
    body = body.slice(0, start) + text + body.slice(end); await tick(); area.focus(); area.selectionStart = area.selectionEnd = start + text.length;
  }
  function insertPerson() {
    const exact = matches.find(id => store.dataset.people[id].name === personQuery.trim());
    if (exact || matches.length === 1) { void insert(`[[p:${exact || matches[0]}]]`); personQuery = ''; }
    else status = store.t.get(matches.length ? 'chapterPersonAmbiguous' : 'chapterPersonMiss', { names: matches.map(id => store.dataset.people[id].name).join(' · ') });
  }
  async function photo() {
    if (!photos?.[0]) { status = store.t.get('photoNeedFile'); return; } busy = true;
    try { const blob = await freeResize(photos[0]) as Blob, name = `chronicle-${Date.now().toString(36)}.jpg`; await store.stageFile(`photos/${name}`, blob); await insert(`![](/photos/${name})`); status = store.t.get('photoStoredLocally'); }
    catch (error) { status = error instanceof Error ? error.message : String(error); } finally { busy = false; }
  }
  async function save() {
    busy = true;
    try {
      const candidate = chapterCandidate({ file, title, date, body, unsourced }, store.snapshot(), chapters, store.t);
      await stageChapter(store.tree, candidate); await store.refreshFiles();
      store.chronicle = { ...store.chronicle, ...candidate.set };
      store.edit(() => {}); ondone(candidate.file);
    } catch (error) { status = error instanceof Error ? error.message : String(error); } finally { busy = false; }
  }
</script>
<section class="chronicle">
  <h2>{store.t.get(file ? 'chapterEdit' : 'chapterNew')}</h2>
  {#if loading && !status}<p role="status">{store.t.get('chronicleLoading')}</p>{/if}
  <fieldset disabled={loading || busy}>
    <label>{store.t.get('chapterTitle')}<input id="chTitle" bind:value={title} /></label>
    <label>{store.t.get('chapterDate')}<input id="chDate" type="date" bind:value={date} /></label><button type="button" id="chDateClear" onclick={() => date = ''}>{store.t.get('chapterDateClear')}</button>
    <div class="toolbar"><div class="search-holder"><input id="chPerson" bind:value={personQuery} placeholder={store.t.get('chapterPersonPh')} aria-label={store.t.get('chapterPersonPh')} autocomplete="off" />
      {#if personQuery.trim()}<div id="chPersonResults" class="search-suggest">{#each matches as id}<button type="button" data-suggest={id} onclick={() => { void insert(`[[p:${id}]]`); personQuery = ''; }}>{store.dataset.people[id].name || id}</button>{/each}</div>{/if}</div>
      <button id="chInsPerson" onclick={insertPerson}>{store.t.get('chapterInsPerson')}</button>
    </div>
    <div class="toolbar"><select id="chSource" bind:value={source} aria-label={store.t.get('sources')}><option value="">{store.t.get('none')}</option>{#each documents as doc}<option value={doc.url}>{doc.label}</option>{/each}</select><button id="chInsSource" disabled={!source} onclick={() => insert(`[[s:${source}]]`)}>{store.t.get('chapterInsSource')}</button></div>
    <div class="toolbar"><input id="chPhoto" type="file" accept="image/*" bind:files={photos} aria-label={store.t.get('photo')} /><button id="chInsPhoto" onclick={photo}>{store.t.get('chapterInsPhoto')}</button></div>
    <label>{store.t.get('chapterBody')}<textarea id="chBody" bind:this={area} bind:value={body} rows="18"></textarea></label>
    <button id="chPreviewBtn" onclick={() => preview = !preview}>{store.t.get('chapterPreview')}</button>
    {#if preview}<div class="chronicle-preview" id="chPreview"><ChapterContent {store} {body} {chapters} {onperson} onchapter={(file, section) => { window.open(`/?view=chronicle&chapter=${encodeURIComponent(file)}${section ? `#${encodeURIComponent(section)}` : ''}`, '_blank', 'noopener'); }} /></div>{/if}
    <button id="chSave" onclick={save}>{store.t.get('chapterSave')}</button>
  </fieldset><button id="chCancel" onclick={oncancel}>{store.t.get('cancel')}</button><p id="chStatus" role={status ? 'alert' : 'status'}>{status || store.t.get('chapterHint')}</p>
</section>
