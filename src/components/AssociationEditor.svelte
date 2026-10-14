<script lang="ts">
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset, Association } from '../domain/person';
  import { associationsFor, setAssociation, removeAssociation } from '../../public/assets/associations.js';
  import { normalizeDate } from '../../public/assets/date-grammar.js';
  import { createPerson } from '../domain/sources';
  import { sourceUrl } from '../data/family';
  import PersonPicker from './PersonPicker.svelte';
  let { store, id, commit }: { store: Workspace; id: string; commit(operation?: (data: Dataset) => void): void } = $props();
  let t = $derived(store.t);
  let links = $derived(associationsFor(store.dataset.people, id) as { id: string; from: string; to: string; other: string; outgoing: boolean; detail: Association }[]);
  let pick = $state(false), role = $state('enslaver'), error = $state('');
  function change(operation: (data: Dataset) => void) {
    try { commit(operation); error = ''; } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }
  function link(data: Dataset, other: string) {
    setAssociation(data, role === 'enslaver' ? id : other, role === 'enslaver' ? other : id, { type: 'enslavement' });
  }
  function create() {
    const name = prompt(t.get('associationNewName'));
    if (name?.trim()) change(data => link(data, createPerson(data, name.trim())));
  }
</script>

<details class="person-disclosure relation-box" data-association-editor>
  <summary>{t.get('relAssociations')}</summary>
  {#each links as link (link.id)}
    <div class="relation-annotation" data-association-row={link.other}>
      <strong>{store.dataset.people[link.other].name || link.other}</strong>
      <label>{t.get('associationRole')}<select aria-label={`${t.get('associationRole')}: ${store.dataset.people[link.other].name || link.other}`} value={link.outgoing ? 'enslaver' : 'enslaved'} onchange={event => change(data => {
        if ((event.currentTarget.value === 'enslaver') === link.outgoing) return;
        removeAssociation(data, link.from, link.to); setAssociation(data, link.to, link.from, link.detail);
      })}><option value="enslaver">{t.get('associationEnslaver')}</option><option value="enslaved">{t.get('associationEnslaved')}</option></select></label>
      <label>{t.get('associationDates')}<input data-association-dates={link.other} value={(link.detail.documented || []).join(', ')} placeholder="1841, 1846" onchange={event => change(data => {
        const documented = [...new Set(event.currentTarget.value.split(',').map(value => normalizeDate(value.trim())).filter(Boolean))];
        const detail = { ...link.detail }; if (documented.length) detail.documented = documented; else delete detail.documented;
        setAssociation(data, link.from, link.to, detail);
      })} /></label>
      {#if link.detail.sources?.length}<ul>{#each link.detail.sources as source}<li><a href={sourceUrl(source.url, store.assets)} target="_blank" rel="noreferrer">{source.label || source.url}</a></li>{/each}</ul>{/if}
      <button type="button" class="text-action" data-remove-association={link.other} onclick={() => change(data => removeAssociation(data, link.from, link.to))}>{t.get('associationRemove')}</button>
    </div>
  {/each}
  <p class="editor-help">{t.get('associationDatesHelp')}</p>
  <label>{t.get('associationNewRole')}<select bind:value={role}><option value="enslaver">{t.get('associationEnslaver')}</option><option value="enslaved">{t.get('associationEnslaved')}</option></select></label>
  <div class="toolbar"><button type="button" data-add-association onclick={() => pick = true}>{t.get('associationAdd')}</button><button type="button" data-create-association onclick={create}>{t.get('associationCreate')}</button></div>
  {#if error}<p role="alert">{error}</p>{/if}
</details>
{#if pick}<PersonPicker title={t.get('associationAdd')} people={store.dataset.people} exclude={[id, ...links.map(link => link.other)]} {t} onpick={other => { pick = false; if (other) change(data => link(data, other)); }} />{/if}
