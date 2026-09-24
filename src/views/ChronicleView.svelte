<script lang="ts">
  import { untrack, tick } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import { chapterText } from '../data/chronicle';
  import { parseChapter } from '../../public/assets/chronicle.js';
  import ChapterContent from '../components/ChapterContent.svelte';
  import ChapterEditor from '../components/ChapterEditor.svelte';
  let { store, onperson, initialFile = undefined, initialSection = '' }: { store: Workspace; onperson(id: string): void; initialFile?: string | null; initialSection?: string; } = $props();
  let chapter = $state<string | null | undefined>(untrack(() => initialFile)), section = $state(untrack(() => initialSection));
  let editing = $state<string | null>(null), parsed = $state<{ frontmatter: Record<string, string>; body: string } | null>(null), error = $state('');
  let chapters = $derived(store.chronicle || { chapters: [] });
  let file = $derived(chapter === undefined ? chapters.chapters[0]?.file || null : chapter);
  let position = $derived(chapters.chapters.findIndex(ch => ch.file === file));
  $effect(() => {
    const wanted = file;
    if (!wanted || editing !== null) return;
    const controller = new AbortController(); parsed = null; error = '';
    void chapterText(store.tree, wanted, controller.signal).then(async text => {
      if (controller.signal.aborted) return; parsed = parseChapter(text); await tick();
      if (!controller.signal.aborted && section) { document.getElementById(section)?.scrollIntoView({ block: 'start' }); section = ''; }
    }).catch(() => { if (!controller.signal.aborted) error = store.t.get('chronicleLoadFailed'); });
    return () => controller.abort();
  });
  function open(target: string, part = '') {
    const same = target === file && editing === null;
    chapter = target || null; section = part; editing = null;
    if (same && part) { void tick().then(() => { document.getElementById(part)?.scrollIntoView({ block: 'start' }); section = ''; }); }
    if (!part) window.scrollTo(0, 0);
  }
</script>
<section class="workspace chronicle-workspace">
  {#if editing !== null}<ChapterEditor {store} file={editing} {chapters} {onperson} oncancel={() => editing = null} ondone={file => { editing = null; open(file); }} />
  {:else}
    {#if !file}<h2>{store.t.get('chronicleTitle')}</h2><ol class="chronicle-toc">
      {#each chapters.chapters as ch}<li><a href={`?view=chronicle&chapter=${encodeURIComponent(ch.file)}`} data-chapter={ch.file} onclick={event => { event.preventDefault(); open(ch.file); }}>{ch.title}</a>{#if ch.date} <span>{ch.date}</span>{/if}
        {#if ch.sections?.length}<ul>{#each ch.sections as s}<li><a href={`?view=chronicle&chapter=${encodeURIComponent(ch.file)}#${s.id}`} data-section={s.id} onclick={event => { event.preventDefault(); open(ch.file, s.id); }}>{s.text}</a></li>{/each}</ul>{/if}
      </li>{/each}</ol>
      {#if store.admin}<button id="chapterNew" onclick={() => editing = ''}>{store.t.get('chapterNew')}</button>{/if}
    {:else}
      <p><a href="?view=chronicle" data-chapter="" onclick={event => { event.preventDefault(); chapter = null; }}>← {store.t.get('chronicleToc')}</a></p>
      {#if error}<p role="alert">{error}</p>{:else if !parsed}<p role="status">{store.t.get('chronicleLoading')}</p>{:else}
        <article class="chronicle-chapter"><h2>{parsed.frontmatter.title || chapters.chapters[position]?.title || file}</h2>{#if parsed.frontmatter.date}<p>{parsed.frontmatter.date}</p>{/if}
          <ChapterContent {store} body={parsed.body} {chapters} {onperson} onchapter={open} />
        </article>
        <div class="toolbar chronicle-nav">{#if chapters.chapters[position - 1]}<button data-chapter={chapters.chapters[position - 1].file} onclick={() => open(chapters.chapters[position - 1].file)}>← {chapters.chapters[position - 1].title}</button>{/if}
          {#if chapters.chapters[position + 1]}<button data-chapter={chapters.chapters[position + 1].file} onclick={() => open(chapters.chapters[position + 1].file)}>{chapters.chapters[position + 1].title} →</button>{/if}</div>
        {#if store.admin}<div class="chronicle-edit"><button id="chapterEdit" onclick={() => editing = file}>{store.t.get('chapterEdit')}</button></div>{/if}
      {/if}
    {/if}
  {/if}
</section>
