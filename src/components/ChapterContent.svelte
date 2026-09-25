<script lang="ts">
  import { renderChapter } from '../../public/assets/chronicle.js';
  import type { Workspace } from '../state/workspace.svelte';
  import type { ChronicleIndex } from '../domain/person';
  import { sourceDocuments } from '../domain/sources';
  import thumbnails from '../../public/assets/source-thumbnails.json';
  import { formatChapterPresentation } from './chapter-presentation';
  import { formatChapterMedia } from './chapter-media';
  let { store, body, chapters, onperson, onchapter }: { store: Workspace; body: string; chapters: ChronicleIndex; onperson(id: string): void; onchapter(file: string, section?: string): void } = $props();
  let html = $derived.by(() => {
    const documents = sourceDocuments(store.dataset.people);
    const text = renderChapter(body, {
      personLabel: (id: string) => store.dataset.people[id]?.name ?? null,
      sourceLabel: (url: string) => documents.find(doc => doc.url === url)?.label || null,
      chapterLabel: (ref: string) => { const [file, section] = ref.split('#'), chapter = chapters.chapters.find(ch => ch.file === file); return section ? chapter?.sections?.find(s => s.id === section)?.text || null : chapter?.title || null; },
    });
    // Only sanitized Markdown is HTML. No application controls are rendered here.
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    formatChapterPresentation(parsed.body, thumbnails, location.origin);
    formatChapterMedia(parsed.body);
    for (const el of parsed.querySelectorAll('img[src], a[href]')) {
      const attr = el.tagName === 'IMG' ? 'src' : 'href', url = el.getAttribute(attr)!;
      if (store.assets.has(url)) el.setAttribute(attr, store.assets.get(url)!);
      if (el.tagName === 'A') el.setAttribute('rel', 'noreferrer');
    }
    return parsed.body.innerHTML;
  });
  let content: HTMLDivElement;
  $effect(() => {
    const failed = (event: Event) => { const image = event.target; if (image instanceof HTMLImageElement && image.closest('.document-preview')) image.remove(); };
    content.addEventListener('error', failed, true);
    return () => content.removeEventListener('error', failed, true);
  });
  function click(event: MouseEvent) {
    const el = (event.target as Element).closest<HTMLAnchorElement>('a'); if (!el) return;
    if (el.dataset.person) { event.preventDefault(); onperson(el.dataset.person); }
    else if (el.dataset.chapter) { event.preventDefault(); onchapter(el.dataset.chapter, el.dataset.section); }
  }
</script>
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (Delegation for real Markdown anchors, whose keyboard activation emits click.) -->
<div bind:this={content} class="chapter-content" onclick={click}>{@html html}</div>
