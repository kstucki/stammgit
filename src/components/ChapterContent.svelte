<script lang="ts">
  import { renderChapter } from '../../public/assets/chronicle.js';
  import type { Workspace } from '../state/workspace.svelte';
  import type { ChronicleIndex } from '../domain/person';
  import { sourceDocuments } from '../domain/sources';
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
    formatChapterMedia(parsed.body);
    for (const el of parsed.querySelectorAll('img[src], a[href]')) {
      const attr = el.tagName === 'IMG' ? 'src' : 'href', url = el.getAttribute(attr)!;
      if (store.assets.has(url)) el.setAttribute(attr, store.assets.get(url)!);
      if (el.tagName === 'A') el.setAttribute('rel', 'noreferrer');
    }
    return parsed.body.innerHTML;
  });
  function click(event: MouseEvent) {
    const el = (event.target as Element).closest<HTMLAnchorElement>('a'); if (!el) return;
    if (el.dataset.person) { event.preventDefault(); onperson(el.dataset.person); }
    else if (el.dataset.chapter) { event.preventDefault(); onchapter(el.dataset.chapter, el.dataset.section); }
  }
</script>
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (Delegation for real Markdown anchors, whose keyboard activation emits click.) -->
<div class="chapter-content" onclick={click}>{@html html}</div>
