<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset, ParentType } from '../domain/person';
  import { createPerson } from '../domain/sources';
  import { linkRecordedRelation, setParentDetail, setPartnerDetail, partnerDetail } from '../../public/assets/relationships.js';
  import { parentDescription } from '../../public/assets/relationship-text.js';
  import { removePersonFromData, absorbPerson, mergeNeedsReview } from '../../public/assets/model.js';
  import PersonPicker from './PersonPicker.svelte';
  import PhotoEditor from './PhotoEditor.svelte';
  import SourceEditor from './SourceEditor.svelte';
  let { store, id, onclose, onperson }: { store: Workspace; id: string; onclose(): void; onperson(id: string): void } = $props();
  let dialog: HTMLDialogElement;
  const initial = untrack(() => store.dataset.people[id]);
  let name = $state(initial.name || ''), birth = $state(initial.birth || ''), death = $state(initial.death || ''), occupation = $state(initial.occupation || ''), notes = $state((initial.notes || []).join('\n'));
  let gender = $state(initial.gender || '');
  let error = $state(''), pick = $state<'parents' | 'children' | 'partners' | 'merge' | null>(null);
  let person = $derived(store.dataset.people[id]);
  let t = $derived(store.t);
  const labels = { parents: ['relParents', 'addExistingParent', 'addNewParent', 'relParentNew'], children: ['relChildren', 'addExistingChild', 'addNewChild', 'relChildNew'], partners: ['relPartners', 'addExistingPartner', 'addNewPartner', 'relPartnerNew'] };
  onMount(() => dialog.showModal());
  function commit(operation: (data: Dataset) => void = () => {}) {
    store.edit(data => {
      const p = data.people[id]; p.name = name.trim() || p.name;
      for (const [key, value] of [['birth', birth], ['death', death], ['occupation', occupation]] as const) { if (value.trim()) p[key] = value.trim(); else delete p[key]; }
      if (gender) p.gender = gender; else delete p.gender;
      const lines = notes.split('\n').map(n => n.trim()).filter(Boolean); if (lines.length) p.notes = lines; else delete p.notes;
      operation(data);
    }); error = '';
  }
  function act(operation?: (data: Dataset) => void) { try { commit(operation); return true; } catch (err) { error = err instanceof Error ? err.message : String(err); return false; } }
  function add(type: 'parents' | 'children' | 'partners') {
    const wanted = prompt(t.get('newRelationPrompt', { label: t.get(labels[type][3]) }));
    if (wanted?.trim()) act(data => linkRecordedRelation(data, type, id, createPerson(data, wanted.trim())));
  }
  function picked(other: string | null) {
    const action = pick; pick = null; if (!other || !action) return;
    if (action === 'merge') {
      if (!confirm(t.get('mergeConfirm', { from: name, to: store.dataset.people[other].name || other }))) return;
      if (act(data => { const result = absorbPerson(data, other, id); if (!result.ok) throw new Error(t.get(result.reason === 'relationship_details' ? 'mergeRelationshipBlocked' : 'mergeFailed')); })) { onclose(); onperson(other); }
    } else act(data => linkRecordedRelation(data, action, id, other));
  }
  async function remove() {
    if (store.dataset.meta.focusPersonId === id) return alert(t.get('deleteFocus'));
    const linked = (store.chronicle?.chapters || []).filter(ch => ch.persons.includes(id));
    if (linked.length) return alert(t.get('chronicleDeleteBlocked', { n: linked.length }));
    const n = ['parents', 'children', 'partners'].reduce((n, key) => n + (person[key as 'parents'] || []).length, 0);
    if (!confirm(t.get('deleteConfirm', { name, n }))) return;
    const photo = person.photo;
    try { store.edit(data => { if (!removePersonFromData(data, id).ok) throw new Error(t.get('deleteFailed')); }); onclose(); if (photo) await store.releasePhoto(photo); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
  }
  const typeOf = (parent: string) => { const type = person.parentDetails?.[parent]?.type; return !type || type === 'unknown' ? 'biological' : type; };
</script>
<dialog id="editDialog" bind:this={dialog} class="workspace native-dialog" onclose={onclose} aria-labelledby="editTitle">
  <button type="button" class="dialog-close" aria-label={t.get('close')} onclick={onclose}>×</button>
  <div id="editDialogContent"><h2 id="editTitle">{t.get('editTitle', { name })}</h2>
    <form id="personEditor" class="editor" onsubmit={event => { event.preventDefault(); if (act()) onclose(); }}>
      <fieldset disabled={store.saving || store.fileBusy > 0} aria-busy={store.fileBusy > 0}>
      <div class="editor-grid"><label>{t.get('fieldName')}<input name="name" bind:value={name} required /></label><label>{t.get('fieldBirth')}<input name="birth" bind:value={birth} placeholder={t.get('fieldBirthHint')} /></label><label>{t.get('fieldDeath')}<input name="death" bind:value={death} placeholder={t.get('fieldDeathHint')} /></label></div>
      <label>{t.get('fieldGender')}<select name="gender" bind:value={gender}><option value="">{t.get('genderUnknown')}</option><option value="m">{t.get('gender_m')}</option><option value="f">{t.get('gender_f')}</option><option value="d">{t.get('gender_d')}</option></select></label>
      <label>{t.get('fieldOccupation')}<input name="occupation" bind:value={occupation} /></label><label>{t.get('fieldNotes')}<textarea name="notes" bind:value={notes}></textarea></label>
      {#each ['parents', 'partners', 'children'] as type}
        {@const relation = type as 'parents' | 'partners' | 'children'}
        <section class="relation-box"><h3>{t.get(labels[relation][0])}</h3>
          {#each person[relation] || [] as other (other)}<div class="relation-annotation"><strong>{store.dataset.people[other]?.name || other}</strong>
            {#if relation === 'parents'}
              <label>{t.get('parentRelationType')}<select data-parent-type={other} value={typeOf(other)} aria-label={`${t.get('parentRelationType')}: ${store.dataset.people[other]?.name || other}`} onchange={event => act(data => setParentDetail(data, id, other, { type: event.currentTarget.value as ParentType, label: '' }))}>
                {#if !['biological', 'adoptive'].includes(typeOf(other))}<option value={typeOf(other)} disabled>{parentDescription(store.dataset, other, id, t)}</option>{/if}
                <option value="biological">{t.get('familyBiological')}</option><option value="adoptive">{t.get('parentAdopted')}</option>
              </select></label>
              {#if person.parentDetails?.[other]?.label}<p>{person.parentDetails[other].label}</p>{/if}
            {:else if relation === 'partners'}
              <label>{t.get('partnerStatus')}<select data-partner-status={other} value={partnerDetail(store.dataset.people, id, other).status || ''} onchange={event => act(data => setPartnerDetail(data, id, other, { status: event.currentTarget.value }))}>
                <option value="">—</option><option value="verheiratet">{t.get('statusMarried')}</option><option value="geschieden">{t.get('statusDivorced')}</option><option value="verwitwet">{t.get('statusWidowed')}</option><option value="partner">{t.get('statusPartner')}</option>
              </select></label>
              {#each ['start', 'end'] as key}<label>{t.get(key === 'start' ? 'partnerStartLabel' : 'partnerEndLabel')}<input data-partner-field={key} data-partner={other} value={partnerDetail(store.dataset.people, id, other)[key] || ''} onchange={event => act(data => setPartnerDetail(data, id, other, { [key]: event.currentTarget.value.trim() }))} /></label>{/each}
            {/if}
          </div>{/each}
          {#if !person[relation]?.length}<p>{t.get('none')}</p>{/if}
          <div class="toolbar"><button type="button" data-add-relation={relation} onclick={() => pick = relation}>{t.get(labels[relation][1])}</button><button type="button" data-create-relation={relation} onclick={() => add(relation)}>{t.get(labels[relation][2])}</button></div>
        </section>
      {/each}
      <PhotoEditor {store} {id} {commit} /><SourceEditor {store} {id} {commit} />
      {#if error}<p role="alert">{error}</p>{/if}
      <div class="toolbar"><button type="submit">{t.get('save')}</button><button type="button" id="mergePersonBtn" disabled={mergeNeedsReview(store.dataset, id)} onclick={() => pick = 'merge'}>{t.get('mergeButton')}</button><button type="button" class="danger" id="deletePersonBtn" onclick={remove}>{t.get('deleteButton')}</button></div>
      {#if mergeNeedsReview(store.dataset, id)}<p>{t.get('mergeRelationshipBlocked')}</p>{/if}<p>{t.get('editFooter')}</p>
      </fieldset>
    </form>
  </div>
</dialog>
{#if pick}<PersonPicker title={pick === 'merge' ? t.get('mergePickTitle', { name }) : t.get(labels[pick][1])} people={store.dataset.people} exclude={pick === 'merge' ? [id] : [id, ...(person.parents || []), ...(person.partners || []), ...(person.children || [])]} {t} onpick={picked} />{/if}
