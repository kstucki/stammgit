<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import { sourceDocuments, sourceCategories, sourceCategory, setSourceCategory, chronicleSourceUrls, sourcePage, type SourceFilter } from '../domain/sources';
  import type { SourceCategory } from '../domain/person';
  import { sourceBase, sourceVariant } from '../domain/source-language';
  import { sourceUrl } from '../data/family';
  import ResponsivePanel from '../components/ResponsivePanel.svelte';
  import { isWebUrl } from '../../public/assets/web-links.js';
  let { store, onperson, query = '', onclear, filter = $bindable(), personOpen = false }: {
    store: Workspace; onperson(id: string): void; query?: string; onclear(): void; filter: SourceFilter; personOpen?: boolean;
  } = $props();
  let status = $state(''), tags = $state('');
  let heading = $state<HTMLHeadingElement>();
  let resultsHeading: HTMLHeadingElement;
  let entries = $derived(sourceDocuments(store.dataset.people, store.sourceFiles, store.dataset.sourceDetails));
  let chronicleSources = $derived(chronicleSourceUrls(store.chronicle));
  let result = $derived(sourcePage(entries, store.dataset, query, filter));
  let selected = $derived(entries.find(doc => doc.url === filter.selected));
  let detail = $derived(selected ? store.dataset.sourceDetails?.[selected.url] : undefined);
  let t = $derived(store.t);
  const categoryLabel = (category: SourceCategory | 'all') => t.get(category === 'all' ? 'sourceAll' : `sourceCategory_${category}`);
  const peopleLabel = (n: number) => t.get(n === 1 ? 'sourcePersonCount' : 'sourcePeopleCount', { n });
  function linkedText(value: string) {
    const parts: { text: string; url?: string }[] = []; let cursor = 0;
    for (const match of value.matchAll(/https?:\/\/[^\s<>"“”«»]+/g)) {
      const url = match[0].replace(/[.,;]+$/, '');
      if (!isWebUrl(url)) continue;
      parts.push({ text: value.slice(cursor, match.index) }, { text: url, url });
      cursor = match.index + url.length;
    }
    parts.push({ text: value.slice(cursor) }); return parts;
  }
  $effect(() => { if (result.page !== filter.page) filter = { ...filter, page: result.page }; });
  $effect(() => {
    const url = selected?.url;
    if (url) untrack(() => { tags = (store.dataset.sourceDetails?.[url]?.tags || []).join(', '); });
  });
  $effect(() => { if (selected && !personOpen) void tick().then(() => heading?.focus({ preventScroll: true })); });
  function category(value: string) { filter = { category: value as SourceFilter['category'], family: '', page: 1, selected: '' }; }
  function page(value: number) { filter = { ...filter, page: value, selected: '' }; resultsHeading?.scrollIntoView({ block: 'start' }); }
  function close() { filter = { ...filter, selected: '' }; }
  function saveTags() {
    if (!selected) return;
    const { url, label } = selected;
    try {
      store.edit(data => {
        data.sourceDetails ||= {};
        data.sourceDetails[url] = { ...data.sourceDetails[url], title: data.sourceDetails[url]?.title || label, tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))] };
      });
      status = t.get('sourceTagsSaved');
    } catch (err) { status = err instanceof Error ? err.message : String(err); }
  }
  function changeCategory(url: string, event: Event) {
    try { store.edit(data => setSourceCategory(data, url, (event.currentTarget as HTMLSelectElement).value as SourceCategory)); }
    catch (error) { status = error instanceof Error ? error.message : String(error); }
  }
  async function uploadDocument(url: string, code: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    const target = (code === 'de' ? sourceBase(url) : sourceVariant(url, code))?.split(/[?#]/)[0];
    if (!file || !target) return;
    try {
      if (!/\.pdf$/i.test(file.name)) throw new Error(t.get('sourceTranslationPdf'));
      if (file.size > 4 * 1024 * 1024) throw new Error(t.get('srcTooBig'));
      if (store.sourceFiles.has(target) && !confirm(t.get(code === 'de' ? 'sourceReplaceOriginal' : 'sourceReplaceTranslation'))) return;
      await store.stageFile(target.slice('/sources/'.length), file); status = t.get('srcStoredLocally');
    } catch (error) { status = error instanceof Error ? error.message : String(error); }
    finally { input.value = ''; }
  }
</script>

<section class="workspace sources-workspace" aria-busy={store.fileBusy > 0}>
  <header class="source-heading"><h2>{t.get('sources')}</h2><p class="source-intro">{t.get('sourceCatalogTotal', { n: entries.length })}</p></header>
  <p class="source-status" role="status">{status}</p>
  <div class="source-catalog" class:source-detail-open={!!selected && !personOpen}>
    <nav class="source-nav" aria-label={t.get('sourceContents')}>
      <button type="button" class:active={filter.category === 'all'} aria-current={filter.category === 'all' ? 'page' : undefined} onclick={() => category('all')}><span>{categoryLabel('all')}</span><span>{result.matched}</span></button>
      {#each sourceCategories as key}<button type="button" data-source-category={key} class:active={filter.category === key} aria-current={filter.category === key ? 'page' : undefined} onclick={() => category(key)}><span>{categoryLabel(key)}</span><span>{result.counts[key]}</span></button>{/each}
    </nav>
    <div class="source-results">
      <div class="source-filters">
        <label class="source-mobile-category">{t.get('sourceCategory')}<select aria-label={t.get('sourceCategory')} value={filter.category} onchange={event => category(event.currentTarget.value)}><option value="all">{categoryLabel('all')} ({result.matched})</option>{#each sourceCategories as key}<option value={key}>{categoryLabel(key)} ({result.counts[key]})</option>{/each}</select></label>
        {#if filter.category === 'belege'}<label class="source-family-filter">{t.get('sourceFamily')}<select id="sourceFamily" value={filter.family} onchange={event => filter = { ...filter, family: event.currentTarget.value, page: 1, selected: '' }}><option value="">{t.get('sourceAllFamilies')}</option>{#each result.families as family}<option value={family}>{family}</option>{/each}</select></label>{/if}
      </div>
      <h3 bind:this={resultsHeading} class="source-category-title">{categoryLabel(filter.category)}</h3>
      {#if filter.category !== 'all'}<p class="source-category-description">{t.get(`sourceCategoryDescription_${filter.category}`)}</p>{/if}
      <div class="source-results-status"><p role="status">{t.get('sourceResultCount', { n: result.total, page: result.page, pages: result.pages })}</p>{#if query || filter.family}<button type="button" class="link-button" onclick={() => { onclear(); filter = { ...filter, family: '', page: 1, selected: '' }; }}>{t.get('sourceClearFilters')}</button>{/if}</div>
      <div class="source-list" id="source-category-{filter.category}">
        {#each result.docs as doc (doc.url)}
          {@const info = store.dataset.sourceDetails?.[doc.url]}
          <article class="source-doc" class:source-selected={filter.selected === doc.url} data-source-url={doc.url}>
            <div class="source-row-text"><h4><button type="button" class="source-title" data-open-source={doc.url} aria-haspopup="dialog" onclick={() => filter = { ...filter, selected: doc.url }}>{doc.label}</button></h4>
              <p class="source-row-meta">{#if info?.id}<span>{info.id}</span>{/if}<span>{!doc.persons.length && chronicleSources.has(doc.url) ? t.get('sourceUsedInChronicle') : peopleLabel(doc.persons.length)}</span>{#if store.assets.has(doc.url)}<span>{t.get('sourcePendingTag')}</span>{/if}</p>
            </div>
            <a class="source-direct" href={store.sourceHref(doc.url)} target="_blank" rel="noreferrer" aria-label={t.get('sourceOpenNamed', { title: doc.label })}>{doc.url.toLowerCase().endsWith('.pdf') ? 'PDF' : t.get('sourceOpenShort')} <span aria-hidden="true">↗</span></a>
          </article>
        {/each}
        {#if !result.total}<p class="source-empty">{t.get('noHits')}</p>{/if}
      </div>
      {#if result.pages > 1}<nav class="source-pagination" aria-label={t.get('sourcePagination')}><button type="button" data-source-prev disabled={result.page === 1} onclick={() => page(result.page - 1)}>{t.get('sourcePrevious')}</button><span>{t.get('sourcePageOf', { page: result.page, pages: result.pages })}</span><button type="button" data-source-next disabled={result.page === result.pages} onclick={() => page(result.page + 1)}>{t.get('sourceNext')}</button></nav>{/if}
    </div>
  </div>
  {#if selected && !personOpen}
    {@const doc = selected}
    {@const variants = ['en', 'pt'].map(code => ({ code, url: sourceVariant(doc.url, code), label: code === 'en' ? 'English' : 'Português' }))}
    <ResponsivePanel id="sourceDialog" kind="person" labelledby="source-detail-title" level="full" onclose={close} {t}>
      {#key doc.url}<section class="source-detail">
        <p class="source-detail-kind">{categoryLabel(sourceCategory(store.dataset.sourceCategories, doc.url))}{#if detail?.id} · {detail.id}{/if}</p>
        <h2 id="source-detail-title" tabindex="-1" bind:this={heading}>{doc.label}</h2>
        <div class="source-actions"><a class="button-link" href={store.sourceHref(doc.url)} target="_blank" rel="noreferrer">{t.get('openDocument')}</a>
          {#if variants.some(v => v.url && store.sourceFiles.has(v.url))}<div class="source-languages"><a href={sourceUrl(doc.url, store.assets)} target="_blank" rel="noreferrer">{t.get('sourceOriginal')}</a>{#each variants as variant}{#if variant.url && store.sourceFiles.has(variant.url)}<a href={sourceUrl(variant.url, store.assets)} target="_blank" rel="noreferrer">{variant.label}</a>{/if}{/each}</div>{/if}
        </div>
        {#if detail}<dl class="source-metadata">
          {#each [['citation', 'sourceCitation'], ['retrieved', 'sourceRetrieved'], ['kind', 'sourceReproduction'], ['scope', 'sourceScope']] as [key, label]}{@const value = detail[key as 'citation' | 'retrieved' | 'kind' | 'scope']}{#if value}<div><dt>{t.get(label)}</dt><dd>{value}</dd></div>{/if}{/each}
          {#each [['original', 'sourceOrigin'], ['archive', 'sourceArchive']] as [key, label]}{@const value = detail[key as 'original' | 'archive']}{#if value}<div><dt>{t.get(label)}</dt><dd class="source-origin">{#each linkedText(value) as part}{#if part.url}<a href={part.url} target="_blank" rel="noreferrer">{part.text}</a>{:else}{part.text}{/if}{/each}</dd></div>{/if}{/each}
        </dl>{/if}
        {#if detail?.tags?.length}<p class="source-tag-list"><span>{t.get('sourceFamilies')}:</span> {detail.tags.join(' · ')}</p>{/if}
        <details class="source-disclosure source-people" open={doc.persons.length <= 3}>
          <summary>{!doc.persons.length && chronicleSources.has(doc.url) ? t.get('sourceUsedInChronicle') : peopleLabel(doc.persons.length)}</summary>
          <ul class="source-person-list">{#each doc.persons as id}<li><button type="button" class="chip" data-open-person={id} onclick={() => onperson(id)}>{store.dataset.people[id].name || id}</button></li>{/each}</ul>
        </details>
        {#if store.admin}<details class="source-disclosure source-management"><summary>{t.get('sourceManage')}</summary>
          <label class="source-category-switch">{t.get('sourceCategory')}<select value={sourceCategory(store.dataset.sourceCategories, doc.url)} disabled={store.saving} onchange={event => changeCategory(doc.url, event)}>{#each sourceCategories as key}<option value={key}>{categoryLabel(key)}</option>{/each}</select></label>
          {#if sourceCategory(store.dataset.sourceCategories, doc.url) === 'belege'}<label>{t.get('sourceFamilies')}<input name="sourceTags" bind:value={tags} placeholder={t.get('sourceTagsPlaceholder')} /></label><button type="button" data-save-source-tags disabled={store.saving} onclick={saveTags}>{t.get('sourceSaveTags')}</button>{/if}
          {#if variants.some(v => v.url)}<div class="source-uploads"><label>{t.get('sourceUploadOriginal')}<input type="file" accept=".pdf" disabled={store.saving || store.fileBusy > 0} onchange={event => uploadDocument(doc.url, 'de', event)} /></label>
            {#each variants as variant}{#if variant.url}{@const target = variant.url}<div><label>{t.get('sourceUploadTranslation')} · {variant.label}<input type="file" accept=".pdf" disabled={store.saving || store.fileBusy > 0} onchange={event => uploadDocument(doc.url, variant.code, event)} /></label>{#if store.sourceFiles.has(target)}<button type="button" class="danger" disabled={store.saving || store.fileBusy > 0} onclick={() => store.deleteSource(target).catch(error => status = error.message)}>{t.get('sourceDeleteTranslation')} · {variant.label}</button>{/if}</div>{/if}{/each}
          </div>{/if}
          <button type="button" class="danger source-delete" data-delete-source={doc.url} disabled={store.saving || store.fileBusy > 0} onclick={() => store.deleteSource(doc.url).catch(error => status = error.message)}>{t.get('delete')}</button>
        </details>{/if}
      </section>{/key}
    </ResponsivePanel>
  {/if}
</section>
