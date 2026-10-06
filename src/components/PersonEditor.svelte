<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset, ParentType, EvidenceStatus } from '../domain/person';
  import { createPerson } from '../domain/sources';
  import { normalizeDate, defaultLiving } from '../../public/assets/date-grammar.js';
  import { linkRecordedRelation, setParentDetail, setPartnerDetail, partnerDetail } from '../../public/assets/relationships.js';
  import { parentDescription } from '../../public/assets/relationship-text.js';
  import { removePersonFromData, absorbPerson, mergeNeedsReview } from '../../public/assets/model.js';
  import CloseButton from './CloseButton.svelte';
  import EditorTabs from './EditorTabs.svelte';
  import { personInitials } from '../domain/person-info';
  import { sourceUrl } from '../data/family';
  import PersonPicker from './PersonPicker.svelte';
  import PhotoEditor from './PhotoEditor.svelte';
  import SourceEditor from './SourceEditor.svelte';
  import WebLinksEditor from './WebLinksEditor.svelte';
  let { store, id, onclose, onperson }: { store: Workspace; id: string; onclose(): void; onperson(id: string): void } = $props();
  let dialog: HTMLDialogElement;
  let section = $state('person');
  let language = $derived(store.language);
  const languages = [{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }, { value: 'pt', label: 'Português' }];
  const sections = [{ value: 'person', label: 'editorPerson' }, { value: 'family', label: 'familyView' }, { value: 'sources', label: 'sources' }, { value: 'photo', label: 'photo' }];
  async function showInvalidField(event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const panel = input.closest('[id^="editor-section-panel-"]');
    if (panel) section = panel.id.replace('editor-section-panel-', '');
    error = input.validationMessage;
    await tick(); input.focus();
  }
  const initial = untrack(() => store.dataset.people[id]);
  let name = $state(initial.name || ''), birth = $state(initial.birth || ''), death = $state(initial.death || ''), occupation = $state(initial.occupation || ''), notes = $state((initial.notes || []).join('\n'));
  let displayName = $state(initial.displayName || ''), birthSurname = $state(initial.birthSurname || '');
  let living = $state(typeof initial.living === 'boolean' ? initial.living : defaultLiving(initial));
  let birthPlace = $state(initial.birthPlace || ''), deathPlace = $state(initial.deathPlace || '');
  let occupationEn = $state(initial.occupation_en || ''), notesEn = $state((initial.notes_en || []).join('\n'));
  let occupationPt = $state(initial.occupation_pt || ''), notesPt = $state((initial.notes_pt || []).join('\n'));
  let gender = $state(initial.gender || '');
  let evidenceStatus = $state<EvidenceStatus | ''>(initial.evidenceStatus || '');
  let error = $state(''), pick = $state<'parents' | 'children' | 'partners' | 'merge' | null>(null);
  let person = $derived(store.dataset.people[id]);
  let t = $derived(store.t);
  const labels = { parents: ['relParents', 'addExistingParent', 'addNewParent', 'relParentNew'], children: ['relChildren', 'addExistingChild', 'addNewChild', 'relChildNew'], partners: ['relPartners', 'addExistingPartner', 'addNewPartner', 'relPartnerNew'] };
  onMount(() => dialog.showModal());
  function commit(operation: (data: Dataset) => void = () => {}) {
    store.edit(data => {
      const p = data.people[id]; p.name = name.trim() || p.name;
      for (const [key, value] of [['displayName', displayName], ['birthSurname', birthSurname], ['birth', normalizeDate(birth)], ['death', normalizeDate(death)], ['birthPlace', birthPlace], ['deathPlace', deathPlace], ['occupation', occupation], ['occupation_pt', occupationPt], ['occupation_en', occupationEn]] as const) { if (value.trim()) p[key] = value.trim(); else delete p[key]; }
      // A death date always means deceased; otherwise the checkbox decides.
      p.living = p.death ? false : living;
      if (gender) p.gender = gender; else delete p.gender;
      if (evidenceStatus) p.evidenceStatus = evidenceStatus; else delete p.evidenceStatus;
      for (const [key, value] of [['notes', notes], ['notes_pt', notesPt], ['notes_en', notesEn]] as const) {
        const lines = value.split('\n').map(n => n.trim()).filter(Boolean); if (lines.length) p[key] = lines; else delete p[key];
      }
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
      if (act(data => { const result = absorbPerson(data, other, id); if (!result.ok) throw new Error(t.get(result.reason === 'relationship_details' ? 'mergeRelationshipBlocked' : result.reason === 'translation_conflict' ? 'mergeTranslationBlocked' : result.reason === 'display_name_conflict' ? 'mergeDisplayNameBlocked' : result.reason === 'evidence_conflict' ? 'mergeEvidenceBlocked' : 'mergeFailed')); })) { onclose(); onperson(other); }
    } else act(data => linkRecordedRelation(data, action, id, other));
  }
  async function remove() {
    if (store.dataset.meta.focusPersonId === id) return alert(t.get('deleteFocus'));
    const linked = [store.chronicle, ...Object.values(store.chronicle?.variants || {})].flatMap(set => set?.chapters || []).filter(ch => ch.persons.includes(id));
    if (linked.length) return alert(t.get('chronicleDeleteBlocked', { n: linked.length }));
    const n = ['parents', 'children', 'partners'].reduce((n, key) => n + (person[key as 'parents'] || []).length, 0);
    if (!confirm(t.get('deleteConfirm', { name, n }))) return;
    const photo = person.photo;
    try { store.edit(data => { if (!removePersonFromData(data, id).ok) throw new Error(t.get('deleteFailed')); }); onclose(); if (photo) await store.releasePhoto(photo); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
  }
  const typeOf = (parent: string) => { const type = person.parentDetails?.[parent]?.type; return !type || type === 'unknown' ? 'biological' : type; };
</script>
<dialog id="editDialog" bind:this={dialog} class="workspace native-dialog person-editor-dialog" onclose={onclose} aria-labelledby="editTitle">
  <header class="person-info-head editor-head">
    {#if person.photo}<img class="person-info-avatar" src={sourceUrl(person.photo, store.assets)} alt="" />
    {:else}<span class="person-info-avatar person-initials" aria-hidden="true">{personInitials(name)}</span>{/if}
    <div class="person-info-heading"><p>{t.get('edit')}</p><h2 id="editTitle">{name || initial.name}</h2></div>
    <CloseButton label={t.get('close')} onclick={onclose} />
  </header>
  <form id="personEditor" class="editor" oninvalidcapture={showInvalidField} onsubmit={event => { event.preventDefault(); if (act()) onclose(); }}>
    <fieldset class="editor-fields" disabled={store.saving || store.fileBusy > 0} aria-busy={store.fileBusy > 0}>
      <EditorTabs id="editor-section" label={t.get('edit')} items={sections.map(item => ({ ...item, label: t.get(item.label) }))} bind:value={section} />
      <div id="editDialogContent" class="editor-scroll">
        <div id="editor-section-panel-person" role="tabpanel" aria-labelledby="editor-section-tab-person" tabindex="0" hidden={section !== 'person'}>
          <div class="editor-grid editor-identity">
            <label>{t.get('fieldName')}<input name="name" bind:value={name} required /></label>
            <label>{t.get('fieldGender')}<select name="gender" bind:value={gender}><option value="">{t.get('genderUnknown')}</option><option value="m">{t.get('gender_m')}</option><option value="f">{t.get('gender_f')}</option><option value="d">{t.get('gender_d')}</option></select></label>
          </div>
          <details class="person-disclosure editor-names"><summary>{t.get('editorNames')}</summary>
            <div class="editor-grid"><label>{t.get('fieldDisplayName')}<input name="displayName" bind:value={displayName} placeholder={name} /></label><label>{t.get('fieldBirthSurname')}<input name="birthSurname" bind:value={birthSurname} /></label></div>
          </details>
          <div class="editor-grid">
            <label>{t.get('fieldBirth')}<input name="birth" bind:value={birth} placeholder={t.get('fieldBirthHint')} /></label>
            <label>{t.get('fieldBirthPlace')}<input name="birthPlace" bind:value={birthPlace} /></label>
          </div>
          <div class="editor-grid">
            <label>{t.get('fieldDeath')}<input name="death" bind:value={death} placeholder={t.get('fieldDeathHint')} /></label>
            <label>{t.get('fieldDeathPlace')}<input name="deathPlace" bind:value={deathPlace} /></label>
          </div>
          <label class="editor-check"><input type="checkbox" name="living" checked={!death.trim() && living} disabled={!!death.trim()} onchange={event => living = (event.currentTarget as HTMLInputElement).checked} /> {t.get('fieldLiving')}</label>
          <p class="editor-help">{t.get('fieldLivingHelp')}</p>
          <section class="editor-description" aria-labelledby="editor-description-title">
            <div class="editor-description-head"><h3 id="editor-description-title">{t.get('editorDescription')}</h3>
              <EditorTabs id="editor-language" label={t.get('archiveLanguage')} items={languages} bind:value={language} />
            </div>
            <div id="editor-language-panel-de" role="tabpanel" aria-labelledby="editor-language-tab-de" tabindex="0" hidden={language !== 'de'}>
              <label>{t.get('fieldOccupation')}<input name="occupation" lang="de" bind:value={occupation} /></label><label>{t.get('fieldNotes')}<textarea name="notes" lang="de" rows="4" bind:value={notes}></textarea></label>
            </div>
            <div id="editor-language-panel-en" role="tabpanel" aria-labelledby="editor-language-tab-en" tabindex="0" hidden={language !== 'en'}>
              <label>{t.get('fieldOccupation')}<input name="occupation_en" lang="en" bind:value={occupationEn} /></label><label>{t.get('fieldNotes')}<textarea name="notes_en" lang="en" rows="4" bind:value={notesEn}></textarea></label>
            </div>
            <div id="editor-language-panel-pt" role="tabpanel" aria-labelledby="editor-language-tab-pt" tabindex="0" hidden={language !== 'pt'}>
              <label>{t.get('fieldOccupation')}<input name="occupation_pt" lang="pt-BR" bind:value={occupationPt} /></label><label>{t.get('fieldNotes')}<textarea name="notes_pt" lang="pt-BR" rows="4" bind:value={notesPt}></textarea></label>
            </div>
            <p class="editor-help">{t.get('personTranslationHelp')}</p>
          </section>
          <details class="person-disclosure editor-more"><summary>{t.get('editorMoreActions')}</summary>
            <div class="toolbar"><button type="button" id="mergePersonBtn" disabled={mergeNeedsReview(store.dataset, id)} onclick={() => pick = 'merge'}>{t.get('mergeButton')}</button><button type="button" class="danger" id="deletePersonBtn" onclick={remove}>{t.get('deleteButton')}</button></div>
            {#if mergeNeedsReview(store.dataset, id)}<p class="editor-help">{t.get('mergeRelationshipBlocked')}</p>{/if}
            <p class="editor-help">{t.get('editFooter')}</p>
          </details>
        </div>
        <div id="editor-section-panel-family" role="tabpanel" aria-labelledby="editor-section-tab-family" tabindex="0" hidden={section !== 'family'}>
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
              <div class="editor-partner-grid"><label>{t.get('partnerStatus')}<select data-partner-status={other} value={partnerDetail(store.dataset.people, id, other).status || ''} onchange={event => act(data => setPartnerDetail(data, id, other, { status: event.currentTarget.value }))}>
                <option value="">—</option><option value="verheiratet">{t.get('statusMarried')}</option><option value="geschieden">{t.get('statusDivorced')}</option><option value="verwitwet">{t.get('statusWidowed')}</option><option value="partner">{t.get('statusPartner')}</option>
              </select></label>
              {#each ['start', 'end'] as key}<label>{t.get(key === 'start' ? 'partnerStartLabel' : 'partnerEndLabel')}<input data-partner-field={key} data-partner={other} value={partnerDetail(store.dataset.people, id, other)[key] || ''} onchange={event => act(data => setPartnerDetail(data, id, other, { [key]: event.currentTarget.value.trim() }))} /></label>{/each}</div>
            {/if}
          </div>{/each}
          {#if !person[relation]?.length}<p>{t.get('none')}</p>{/if}
          <div class="toolbar"><button type="button" data-add-relation={relation} onclick={() => pick = relation}>{t.get(labels[relation][1])}</button><button type="button" data-create-relation={relation} onclick={() => add(relation)}>{t.get(labels[relation][2])}</button></div>
        </section>
      {/each}
        </div>
        <div id="editor-section-panel-sources" role="tabpanel" aria-labelledby="editor-section-tab-sources" tabindex="0" hidden={section !== 'sources'}>
          <section class="editor-evidence">
            <label>{t.get('fieldEvidenceStatus')}<select name="evidenceStatus" bind:value={evidenceStatus}><option value="">{t.get('evidenceUnassessed')}</option><option value="unsicher">{t.get('evidenceUncertain')}</option><option value="gut">{t.get('evidenceGood')}</option><option value="gesichert">{t.get('evidenceConfirmed')}</option></select></label>
            <p class="editor-help">{t.get('evidenceHelp')}</p>
          </section>
          <SourceEditor {store} {id} {commit} />
          <WebLinksEditor {store} {id} {commit} />
        </div>
        <div id="editor-section-panel-photo" role="tabpanel" aria-labelledby="editor-section-tab-photo" tabindex="0" hidden={section !== 'photo'}><PhotoEditor {store} {id} {commit} /></div>
      </div>
      <footer class="editor-footer">
        {#if error}<p role="alert">{error}</p>{/if}
        <p class="editor-help">{t.get('editorDraftHint')}</p>
        <button type="submit">{t.get('save')}</button>
      </footer>
    </fieldset>
  </form>
</dialog>
{#if pick}<PersonPicker title={pick === 'merge' ? t.get('mergePickTitle', { name }) : t.get(labels[pick][1])} people={store.dataset.people} exclude={pick === 'merge' ? [id] : [id, ...(person.parents || []), ...(person.partners || []), ...(person.children || [])]} {t} onpick={picked} />{/if}
