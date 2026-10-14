<script lang="ts">
  import { canonicalFamilyTag, cleanFamilyTag, similarFamilyTags } from '../domain/family-tags';
  let { selected = $bindable<string[]>([]), options, t, disabled = false }: {
    selected: string[]; options: string[]; t: { get(key: string, values?: Record<string, string | number>): string }; disabled?: boolean;
  } = $props();
  let query = $state(''), open = $state(false);
  let name = $derived(cleanFamilyTag(query));
  let known = $derived([...new Set([...options, ...selected])]);
  let canonical = $derived(canonicalFamilyTag(name, known));
  let matches = $derived(known.filter(tag => tag.toLocaleLowerCase().includes(name.toLocaleLowerCase())).sort((a, b) => a.localeCompare(b, 'de')));
  let similar = $derived(similarFamilyTags(name, known));
  function toggle(tag: string) { selected = selected.includes(tag) ? selected.filter(value => value !== tag) : [...selected, tag]; }
  function create() {
    if (!name || known.includes(canonical)) return;
    selected = [...selected, canonical]; query = '';
  }
</script>

<fieldset class="family-picker" {disabled}>
  <legend>{t.get('sourceFamilies')}</legend>
  <div class="chosen">{#each selected as tag}<button type="button" class="chip" aria-label={t.get('sourceRemoveFamily', { name: tag })} onclick={() => toggle(tag)}>{tag} <span aria-hidden="true">×</span></button>{/each}</div>
  <input name="sourceTags" value={query} aria-label={t.get('sourceFindFamily')} placeholder={t.get('sourceFindFamily')} aria-expanded={open} onfocus={() => open = true} oninput={event => { query = event.currentTarget.value; open = true; }} onkeydown={event => { if (event.key === 'Enter') event.preventDefault(); if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open = false; } }} />
  {#if open}
    <div class="choices">{#each matches as tag}<label><input type="checkbox" checked={selected.includes(tag)} onchange={() => toggle(tag)} />{tag}</label>{/each}</div>
    {#if name && !known.includes(canonical)}
      {#if similar.length}<p>{t.get('sourceSimilarFamilies')} {#each similar as tag}<button type="button" onclick={() => { if (!selected.includes(tag)) toggle(tag); query = ''; }}>{tag}</button>{/each}</p>{/if}
      <button type="button" data-create-family onclick={create}>{t.get('sourceCreateFamily', { name })}</button>
    {/if}
  {/if}
</fieldset>

<style>
  .family-picker { border: 0; padding: 0; margin: 1rem 0; min-width: 0; }
  .chosen { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .5rem; }
  .family-picker > input { width: 100%; box-sizing: border-box; }
  .choices { max-height: 12rem; overflow-y: auto; border: 1px solid var(--border); background: var(--surface); }
  .choices label { display: flex; align-items: center; gap: .5rem; padding: .5rem; }
  .choices input { width: auto; }
  p { color: var(--text-muted); }
</style>
