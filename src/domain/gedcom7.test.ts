import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportGedcom, exportGedcom7, importGedcom } from '../../public/assets/gedcom.js';
import { readGedzip, newGedzipMedia } from '../data/gedzip';

const data = () => ({
  meta: { focusPersonId: 'anna' },
  sourceCategories: { '/sources/beleg.pdf': 'belege' },
  people: {
    anna: { name: 'Anna Magdalena Sample-Smith', gender: 'f', birthSurname: 'Smith', birth: 'um 1790', death: '1855-03-02', living: false, partners: ['hans'], partnerDetails: { hans: { kind: 'marriage', start: '1810' } }, children: ['kind'],
      notes: ['Erste Notiz.', 'Zweite Notiz.'], notes_en: ['English note.'], occupation: 'Hausfrau', occupation_en: 'Housewife', photo: '/photos/anna.jpg',
      sources: [{ label: 'Stadtarchiv: Findmittel, abgerufen 05.10.2026 – Belegsammlung Test, S03', url: '/sources/beleg.pdf#page=7' }, { label: 'Familienauskunft', url: '' }, { label: 'HLS', url: 'https://hls.example/x' }] },
    hans: { name: 'Hans Sample-Smith', gender: 'm', birthSurname: 'Sample', living: false, partners: ['anna'], partnerDetails: { anna: { kind: 'marriage', start: '1810' } }, children: ['kind'] },
    kind: { name: 'Lea Muster', gender: 'f', birth: '1990-04-02', living: true, parents: ['anna', 'hans'], sources: [{ label: 'Brief', url: '/sources/brief.pdf' }] },
    mutter: { name: 'Eva Allein', gender: 'f', living: false, children: ['solo'] },
    solo: { name: 'Solo Allein', living: false, parents: ['mutter'] },
  },
});

describe('GEDCOM 5.5.1 export', () => {
  it('writes header, birth and married names, women as WIFE and short lines', () => {
    const ged = exportGedcom(data(), 'de', { now: new Date(2026, 9, 5) });
    expect(ged).toContain('1 DATE 5 OCT 2026\n1 SUBM @U1@');
    expect(ged).toContain('1 NAME Anna Magdalena /Smith/\n2 TYPE birth');
    expect(ged).toContain('1 NAME Anna Magdalena /Sample-Smith/\n2 TYPE married');
    expect(ged).toMatch(/0 @F\d+@ FAM\n1 WIFE @I4@\n1 CHIL @I5@/);
    expect(ged).not.toContain('beleg.pdf'); expect(ged).not.toContain('Belegsammlung');
    const long = exportGedcom({ meta: { focusPersonId: 'a' }, people: { a: { name: 'A', notes: ['x'.repeat(300) + ' y'.repeat(200)] } } });
    expect(Math.max(...long.split('\n').map(l => l.length))).toBeLessThanOrEqual(255);
    expect(importGedcom(long).people.a.notes[0]).toBe('x'.repeat(300) + ' y'.repeat(200));
  });
  it('anonymizes living persons without breaking kinship', () => {
    const ged = exportGedcom(data(), 'de', { includeLiving: false });
    expect(ged).not.toContain('Lea'); expect(ged).not.toContain('1990');
    const back = importGedcom(ged);
    const child = Object.values(back.people as Record<string, { name: string; parents?: string[] }>).find(p => p.name === 'Lebende Person')!;
    expect(child.parents).toHaveLength(2);
  });
});

describe('GEDCOM 7 export and import', () => {
  it('roundtrips sources, categories, photos and the living flag in one language', () => {
    const original = data();
    const { text, files } = exportGedcom7(original, { language: 'de', sourceFiles: new Set(['/sources/beleg.pdf', '/sources/brief.pdf', '/sources/brief.en.pdf']) });
    expect(text).toContain('2 VERS 7.0');
    expect(text).not.toMatch(/ CONC /);
    expect(text).not.toMatch(/ TRAN /);
    expect(text).toContain('2 PAGE Belegsammlung Test, S03, PDF-Seite 7');
    expect(files.map(f => f.path).sort()).toEqual(['photos/anna.jpg', 'sources/beleg.pdf', 'sources/brief.pdf']);
    const back = importGedcom(text);
    for (const [id, person] of Object.entries(original.people)) {
      const { notes_en, occupation_en, ...german } = person as Record<string, unknown>;
      expect(back.people[id]).toEqual(german);
    }
    expect(back.sourceCategories).toEqual(original.sourceCategories);
  });
  it('writes notes and occupation in the chosen language', () => {
    const { text } = exportGedcom7(data(), { language: 'en' });
    expect(text).toContain('1 OCCU Housewife');
    expect(text).toMatch(/1 NOTE English note\.\n2 LANG en/);
    expect(text).not.toContain('Erste Notiz.');
    const back = importGedcom(text);
    expect(back.people.anna.notes).toEqual(['English note.']);
  });
  it('picks the PDF in the chosen language and falls back to the original', () => {
    const files = exportGedcom7(data(), { language: 'en', sourceFiles: new Set(['/sources/brief.en.pdf']) }).files.map(f => f.path);
    expect(files).toContain('sources/brief.en.pdf'); expect(files).toContain('sources/beleg.pdf'); expect(files).not.toContain('sources/brief.pdf');
  });
  it('reads a GEDZIP package with its files', async () => {
    const { text } = exportGedcom7(data(), { language: 'de' });
    const zip = new JSZip(); zip.file('gedcom.ged', text); zip.file('sources/beleg.pdf', 'pdf'); zip.file('photos/anna.jpg', 'jpg'); zip.file('sources/brief.pdf', 'brief');
    const { parsed, media } = await readGedzip(await zip.generateAsync({ type: 'blob' }));
    expect(parsed.people.anna.photo).toBe('/photos/anna.jpg');
    expect(media.map(m => m.path).sort()).toEqual(['photos/anna.jpg', 'sources/beleg.pdf', 'sources/brief.pdf']);
  });
});


describe('GEDCOM review regressions', () => {
  it.each(['551', '7'])('preserves literal @ text, multiline notes and links in %s', version => {
    const person = { name: 'Anna Test', living: false, notes: ['@I1@\n@erste Zeile\nKontakt: a@example.org', 'x'.repeat(199) + '@' + 'y'.repeat(250)], links: [{ url: 'https://example.org/anna' }] };
    const dataset = { meta: { focusPersonId: 'a' }, people: { a: person } };
    const text = version === '551' ? exportGedcom(dataset) : exportGedcom7(dataset).text;
    expect(text).toContain('1 NOTE @@I1@');
    expect(text).toContain('2 CONT @@erste Zeile');
    if (version === '551') for (const line of text.split('\n')) expect(line.replace(/@@/g, '')).not.toMatch(/^(?:1 NOTE|2 CONC|2 CONT).*@/);
    expect(importGedcom(text).people.a).toEqual(person);
  });
  it('writes an unknown-gender partner beside a man in the WIFE slot', () => {
    const dataset = { meta: { focusPersonId: 'a' }, people: { a: { name: 'A', partners: ['b'] }, b: { name: 'B', gender: 'm', partners: ['a'], partnerDetails: { a: { kind: 'marriage' } } } } };
    expect(exportGedcom7(dataset).text).toContain('1 HUSB @I2@\n1 WIFE @I1@\n1 MARR Y');
  });
  it('exports evidence IDs and citations with no family tags', () => {
    const dataset = { ...data(), sourceDetails: { '/sources/beleg.pdf': { id: 'B000042', title: 'Archivurkunde', citation: 'Archiv, Signatur 42', tags: ['Nicht exportieren'] } } };
    const { text } = exportGedcom7(dataset);
    expect(text).toContain('1 TITL Archivurkunde\n1 REFN B000042');
    expect(text).toContain('1 TEXT Archiv, Signatur 42');
    expect(text).not.toContain('Nicht exportieren');
    expect(importGedcom(text).sourceDetails?.['/sources/beleg.pdf']).toEqual({ id: 'B000042', title: 'Archivurkunde', citation: 'Archiv, Signatur 42' });
  });
  it('does not leak parent sources in the source-free export or private data of excluded living people', () => {
    const dataset = data();
    Object.assign(dataset.people.kind, { links: [{ url: 'https://example.org/private' }], parentDetails: { anna: { type: 'biological', sources: [{ label: 'Geheimer Beleg', url: '/sources/private.pdf' }] } }, photo: '/photos/private.jpg' });
    expect(exportGedcom(dataset)).not.toContain('private.pdf');
    const { text, files } = exportGedcom7(dataset, { includeLiving: false });
    for (const secret of ['Lea', '1990', 'private', 'Geheimer Beleg', 'brief.pdf']) expect(text).not.toContain(secret);
    expect(files.map(f => f.path)).not.toContain('sources/brief.pdf');
  });
  it('does not infer biological parentage from a foreign GEDCOM 7 BIRTH pedigree', () => {
    const text = '0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Kind\n1 FAMC @F1@\n2 PEDI BIRTH\n0 @I2@ INDI\n1 NAME Elternteil\n0 @F1@ FAM\n1 HUSB @I2@\n1 CHIL @I1@\n0 TRLR\n';
    expect(importGedcom(text).people.kind.parentDetails.elternteil).toEqual({ type: 'unknown', label: 'GEDCOM 7: BIRTH' });
  });
  it('rejects a package with missing media instead of importing dangling references', async () => {
    const zip = new JSZip(); zip.file('gedcom.ged', exportGedcom7(data()).text);
    await expect(readGedzip(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow('missing');
  });
  it('installs a translation-only PDF as a usable original, with its page reference', async () => {
    const dataset = { meta: { focusPersonId: 'a' }, people: { a: { name: 'A', living: false, sources: [{ label: 'Brief', url: '/sources/brief.pdf#page=2' }] } } };
    const { text } = exportGedcom7(dataset, { language: 'en', sourceFiles: new Set(['/sources/brief.en.pdf']) });
    const zip = new JSZip(); zip.file('gedcom.ged', text); zip.file('sources/brief.en.pdf', 'English PDF');
    const { parsed, media } = await readGedzip(await zip.generateAsync({ type: 'blob' }));
    expect(parsed.people.a.sources[0].url).toBe('/sources/brief.pdf#page=2');
    expect(media[0].path).toBe('sources/brief.pdf');
    const fresh = await newGedzipMedia(media, new Map(), (async () => new Response(null, { status: 404 })) as typeof fetch);
    expect(fresh).toHaveLength(1);
    expect(await fresh[0].blob.text()).toBe('English PDF');
    const published = (async (url: string) => new Response(url.endsWith('.en.pdf') ? 'English PDF' : 'Original PDF')) as typeof fetch;
    expect(await newGedzipMedia(media, new Map(), published)).toEqual([]);
  });
  it('reuses identical media and rejects a filename collision before staging', async () => {
    const media = [{ path: 'sources/beleg.pdf', blob: new Blob(['incoming']) }];
    const same = (async () => new Response('incoming')) as typeof fetch;
    expect(await newGedzipMedia(media, new Map(), same)).toEqual([]);
    const other = (async () => new Response('other document')) as typeof fetch;
    await expect(newGedzipMedia(media, new Map(), other)).rejects.toThrow('conflict');
  });
});

it('retains a foreign textual source citation even without a URL or media', () => {
  const text = '0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Anna\n1 SOUR @S1@\n2 PAGE 42\n0 @S1@ SOUR\n1 TITL Kirchenbuch\n0 TRLR\n';
  expect(importGedcom(text).people.anna.sources).toEqual([{ label: 'Kirchenbuch, 42', url: '' }]);
});

it('rejects new filenames that the upload endpoint would change', async () => {
  const media = [{ path: 'photos/Portrait.JPG', blob: new Blob(['photo']) }];
  await expect(newGedzipMedia(media, new Map(), (async () => new Response(null, { status: 404 })) as typeof fetch)).rejects.toThrow('unsupported');
});
