<script lang="ts">
  import { navigate } from '../state/navigation';
  import { restorePagePosition } from '../state/page-position';
  import { untrack, tick } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import { chapterText } from '../data/chronicle';
  import { parseChapter } from '../../public/assets/chronicle.js';
  import ChapterHeading from '../components/ChapterHeading.svelte';
  import { chronicleLabels } from '../domain/chronicle-labels';
  import ChapterContent from '../components/ChapterContent.svelte';
  import ChapterEditor from '../components/ChapterEditor.svelte';
  let { store, onperson, initialFile = undefined, initialLanguage = '', initialSection = '' }: { store: Workspace; onperson(id: string): void; initialFile?: string | null; initialLanguage?: string; initialSection?: string; } = $props();
  let language = $derived(initialLanguage), chapter = $derived(initialFile), section = $state('');
  $effect(() => { section = initialSection; });
  let editing = $state<string | null>(null), parsed = $state<{ frontmatter: Record<string, string>; body: string } | null>(null), error = $state('');
  let chapters = $derived((language && store.chronicle?.variants?.[language]) || store.chronicle || { chapters: [] });
  let file = $derived(chapter || null);
  let position = $derived(chapters.chapters.findIndex(ch => ch.file === file));
  type Parsed = { frontmatter: Record<string, string>; body: string };
  let introduction = $state<Parsed | null>(null);
  let labels = $derived(chronicleLabels(language || chapters.language || 'de'));
  $effect(() => {
    const first = chapters.chapters[0]?.file; introduction = null;
    const controller = new AbortController();
    if (first) void chapterText(store.tree, first, controller.signal).then(text => { if (!controller.signal.aborted) introduction = parseChapter(text); }).catch(() => {});
    return () => controller.abort();
  });
  $effect(() => {
    const wanted = file, lang = language; void lang;
    if (!wanted || editing !== null) return;
    const controller = new AbortController(); parsed = null; error = '';
    void chapterText(store.tree, wanted, controller.signal).then(async text => {
      if (controller.signal.aborted) return; parsed = parseChapter(text); await tick();
      if (!controller.signal.aborted && history.state?.archiveScroll) { await restorePagePosition(); section = ''; }
      else if (!controller.signal.aborted && section) { document.getElementById(section)?.scrollIntoView({ block: 'start' }); section = ''; }
    }).catch(() => { if (!controller.signal.aborted) error = store.t.get('chronicleLoadFailed'); });
    return () => controller.abort();
  });
  function open(target: string, part = '') {
    const same = target === file && editing === null;
    navigate({ chapter: target || '', section: part, info: '' }); editing = null;
    if (same && part) { void tick().then(() => { document.getElementById(part)?.scrollIntoView({ block: 'start' }); section = ''; }); }
    if (!part) window.scrollTo(0, 0);
  }
</script>
<section class="workspace chronicle-workspace">
  {#if editing !== null}<ChapterEditor {store} file={editing} {language} {chapters} {onperson} oncancel={() => editing = null} ondone={file => { editing = null; open(file); }} />
  {:else}
    {#if !file}
      <header class="chronicle-titlepage">
        <h1>{labels.title}</h1>
        <p class="chapter-kicker">{[introduction?.frontmatter.author, introduction?.frontmatter.year].filter(Boolean).join(' · ')}</p>
      </header>
      <ol class="chronicle-toc">
        {#each chapters.chapters as ch, i}<li><a href={`?view=chronicle&chapter=${encodeURIComponent(ch.file)}&language=${encodeURIComponent(language)}`} data-chapter={ch.file} onclick={event => { event.preventDefault(); open(ch.file); }}><span class="toc-number">{i + 1}</span><span><strong>{ch.title}</strong>{#if ch.subtitle}<small>{ch.subtitle}</small>{/if}</span></a></li>{/each}
      </ol>
      {#if store.admin}<button id="chapterNew" onclick={() => editing = ''}>{store.t.get('chapterNew')}</button>{/if}
    {:else}
      <p><a href="?view=chronicle&chapter=" data-chapter="" onclick={event => { event.preventDefault(); open(''); }}>← {store.t.get('chronicleToc')}</a></p>
      {#if error}<p role="alert">{error}</p>{:else if !parsed}<p role="status">{store.t.get('chronicleLoading')}</p>{:else}
        <article class="chronicle-chapter">
          <ChapterHeading title={parsed.frontmatter.title || chapters.chapters[position]?.title || file} subtitle={parsed.frontmatter.subtitle} cover={parsed.frontmatter.cover} number={position + 1} label={labels.chapter} assets={store.assets} />
          <ChapterContent {store} body={parsed.body} {chapters} {onperson} onchapter={open} />
        </article>
        <nav class="chronicle-nav" aria-label={store.t.get('chronicleToc')}>
          {#if chapters.chapters[position - 1]}{@const previous = chapters.chapters[position - 1]}<a class="chronicle-back" href={`?view=chronicle&chapter=${encodeURIComponent(previous.file)}&language=${encodeURIComponent(language)}`} data-chapter={previous.file} onclick={event => { event.preventDefault(); open(previous.file); }}><strong>{labels.back}: {position} · {previous.title}</strong>{#if previous.subtitle}<span>{previous.subtitle}</span>{/if}</a>{/if}
          {#if chapters.chapters[position + 1]}{@const next = chapters.chapters[position + 1]}<a class="chronicle-next" href={`?view=chronicle&chapter=${encodeURIComponent(next.file)}&language=${encodeURIComponent(language)}`} data-chapter={next.file} onclick={event => { event.preventDefault(); open(next.file); }}><strong>{labels.next}: {position + 2} · {next.title}</strong>{#if next.subtitle}<span>{next.subtitle}</span>{/if}</a>{/if}
        </nav>
        {#if store.admin}<div class="chronicle-edit"><button id="chapterEdit" onclick={() => editing = file}>{store.t.get('chapterEdit')}</button></div>{/if}
      {/if}
    {/if}
  {/if}
</section>
