<script lang="ts">
  import { tick } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import { chapterText } from '../data/chronicle';
  import { parseChapter, isSafeUrl } from '../../public/assets/chronicle.js';
  import { chronicleLabels } from '../domain/chronicle-labels';
  import ChapterHeading from './ChapterHeading.svelte';
  import ChapterContent from './ChapterContent.svelte';
  let { store, busy = $bindable(false), error = $bindable('') }: { store: Workspace; busy?: boolean; error?: string } = $props();
  type Parsed = { frontmatter: Record<string, string>; body: string };
  let book = $state<Parsed[]>([]), bookElement = $state<HTMLElement>();
  let chapters = $derived(store.chronicle);
  let labels = $derived(chronicleLabels(store.archive.config.language || 'de'));
  let introduction = $derived(book[0]);
  let titlePhoto = $derived(introduction?.frontmatter.cover || introduction?.body.match(/!\[[^\]]*\]\(([^\s)]+)/)?.[1] || '');
  const onperson = () => {}, open = () => {};
  export async function printBook() {
    if (!store.admin || !chapters?.chapters.length || busy) return;
    busy = true; error = '';
    try {
      const selected = [...chapters.chapters];
      book = await Promise.all(selected.map(async ch => parseChapter(await chapterText(store.tree, ch.file))));
      await tick(); await document.fonts.ready;
      await Promise.all([...(bookElement?.querySelectorAll('img') || [])].map(img => img.decode().catch(() => {})));
      document.body.classList.add('printing-chronicle-book');
      window.print();
    } catch { error = labels.failed; }
    finally { busy = false; }
  }
  $effect(() => {
    const clean = () => document.body.classList.remove('printing-chronicle-book');
    window.addEventListener('afterprint', clean);
    return () => { window.removeEventListener('afterprint', clean); clean(); };
  });
</script>
{#if book.length}<section bind:this={bookElement} class="chronicle-print-book workspace" aria-hidden="true">
  <header class="chronicle-titlepage"><h1>{labels.title}</h1>{#if titlePhoto && isSafeUrl(titlePhoto)}<img src={store.assets.get(titlePhoto) || titlePhoto} alt="" />{/if}<p>{introduction?.frontmatter.author || ''} · {introduction?.frontmatter.year || ''}</p></header>
  {#each book as item, i}<article class="chronicle-chapter print-chapter">
    <ChapterHeading title={item.frontmatter.title || chapters?.chapters[i]?.title || ''} subtitle={item.frontmatter.subtitle} cover={item.frontmatter.cover} number={i + 1} label={labels.chapter} assets={store.assets} />
    <ChapterContent {store} body={item.body} chapters={chapters || { chapters: [] }} {onperson} onchapter={open} />
  </article>{/each}
</section>{/if}
