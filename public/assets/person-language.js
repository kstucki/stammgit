// Shared by UI and GEDCOM export. Each translated field falls back to the
// German original; note lists are complete translations, never mixed by index.
/** @param {{ occupation?: string, occupation_pt?: string, occupation_en?: string, notes?: string[], notes_pt?: string[], notes_en?: string[] }} person */
export function personContent(person, language = 'de') {
  const code = language.split('-')[0];
  const occupation = code === 'en' ? person.occupation_en : code === 'pt' ? person.occupation_pt : undefined;
  const notes = (code === 'en' ? person.notes_en : code === 'pt' ? person.notes_pt : undefined)?.filter(note => note.trim());
  return { occupation: occupation?.trim() ? occupation : person.occupation || '',
    notes: notes?.length ? notes : (person.notes || []).filter(note => note.trim()) };
}
