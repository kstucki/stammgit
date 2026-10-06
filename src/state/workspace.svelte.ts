import { availableSources, localizedSource, sourceBase, sourceVariant } from '../domain/source-language';
import { sourceUrl } from '../data/family';
import { setSourceCategory, removeSourceDetails } from '../domain/sources';
import { getT } from '../../public/assets/strings.js';
import { validateDataset } from '../../netlify/shared/validate.mjs';
import * as pending from '../../public/assets/pending.js';
import { countSourceLinks, removeSourceLinks } from '../../public/assets/model.js';
import { syncArchive } from '../data/sync';
import { hydrateChronicle } from '../data/chronicle';
import type { ArchiveSnapshot, TreeIndex, Language } from '../domain/archive';
import type { Dataset, ChronicleIndex } from '../domain/person';
import type { FamilySession } from '../data/family';

export class Workspace {
  dataset = $state<Dataset>({ meta: { focusPersonId: '' }, people: {} });
  chronicle = $state<ChronicleIndex | null>(null);
  assets = $state<ReadonlyMap<string, string>>(new Map());
  publishedSources = $state<string[]>([]);
  sourcePath(url: string) { return localizedSource(url, this.language, this.sourceFiles); }
  sourceHref(url: string) { return sourceUrl(this.sourcePath(url), this.assets); }
  files = $state<string[]>([]);
  deletions = $state<string[]>([]);
  sourceFiles = $derived(availableSources(this.publishedSources, this.assets, this.deletions));

  draft = $state(false);
  legacyPending = $state(false);
  saving = $state(false);
  fileBusy = $state(0);
  progress = $state('');
  index = $state<TreeIndex>({ defaultTree: '', trees: [] });
  sourceLinks: Record<string, Record<string, number>> = {};
  contentHash: string | null = null;
  isNew = false;
  readonly archive: ArchiveSnapshot;
  language = $state<Language>('de');
  t = $derived(getT(this.language));
  private urls: string[] = [];
  constructor(archive: ArchiveSnapshot, session: FamilySession) {
    this.archive = archive;
    const configured = archive.config.language;
    this.language = configured === 'en' ? 'en' : configured === 'pt' || configured === 'pt-BR' ? 'pt' : 'de';
    try { const saved = localStorage.getItem('chronicleLanguage'); if (saved === 'de' || saved === 'pt' || saved === 'en') this.language = saved; } catch { /* Optional language preference. */ }
    this.dataset = session.dataset; this.draft = session.hasDraft; this.chronicle = session.chronicle;
  }
  get tree() { return this.archive.tree.id; }
  get admin() { return this.archive.role === 'admin'; }
  get pending() { return this.draft || this.files.length > 0 || this.deletions.length > 0; }
  get session(): FamilySession { return { dataset: this.dataset, chronicle: this.chronicle, assets: this.assets, sourceFiles: this.sourceFiles, hasDraft: this.draft }; }
  get draftKey() { return `familyTreeDraft:${this.tree}`; }
  get baseKey() { return `familyTreeDraftBase:${this.tree}`; }
  snapshot(): Dataset { return $state.snapshot(this.dataset) as Dataset; }
  async initialize() {
    this.index = this.archive.index || await (await fetch('/data/trees/index.json', { cache: 'no-store' })).json();
    const links = await fetch('/data/source-links.json', { cache: 'no-store' });
    this.sourceLinks = links.ok ? await links.json() : {};
    const inventory = await fetch('/data/source-files.json', { cache: 'no-store' });
    const sourceFiles: unknown = inventory.ok ? await inventory.json() : [];
    this.publishedSources = Array.isArray(sourceFiles) ? sourceFiles.filter((url): url is string => typeof url === 'string' && url.startsWith('/sources/')) : [];
    this.isNew = !this.index.trees.some(tree => tree.id === this.tree);
    this.contentHash = this.index.trees.find(tree => tree.id === this.tree)?.contentHash || null;
    // Reading remains possible when browser storage is unavailable.
    try {
      if (this.tree === 'family' && localStorage.getItem('familyTreeDraft') && !localStorage.getItem(this.draftKey)) {
        localStorage.setItem(this.draftKey, localStorage.getItem('familyTreeDraft')!); localStorage.removeItem('familyTreeDraft');
      }
      const base = localStorage.getItem(this.baseKey);
      if (this.draft && !this.isNew && base !== this.contentHash) {
        const response = await fetch(`/data/trees/${this.tree}.json`, { cache: 'no-store' });
        if (response.ok) {
          const published: Dataset = await response.json();
          const missing = Object.keys(published.people).filter(id => !this.dataset.people[id]).length;
          const fields = Object.entries(published.people).filter(([id, p]) => this.dataset.people[id] &&
            ((p.birth && !this.dataset.people[id].birth) || (p.death && !this.dataset.people[id].death))).length;
          if ((missing || fields) && confirm(this.t.get('draftConflict', { missing, fields }))) {
            localStorage.removeItem(this.draftKey); localStorage.removeItem(this.baseKey);
            this.dataset = published; this.draft = false;
          }
        }
      }
    } catch { /* The server still rejects stale saves by their base hash. */ }
    try {
      const known = new Set(this.index.trees.map(tree => tree.id));
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i); if (key?.startsWith('familyTreeDraft:')) known.add(key.slice(16));
      }
      known.add(this.tree);
      this.legacyPending = await pending.migrateLegacyPending(this.tree, known.size === 1);
      await this.refreshFiles();
    } catch { /* Published assets remain available without IndexedDB. */ }
    this.chronicle = await hydrateChronicle(this.tree, $state.snapshot(this.chronicle), this.files);
  }
  edit(operation: (data: Dataset) => void) {
    if (!this.admin || this.saving) throw new Error(this.t.get('editUnavailable'));
    const candidate = structuredClone(this.snapshot()); operation(candidate);
    const problems = validateDataset(candidate);
    if (problems.length) throw new Error(problems.join('\n'));
    if (localStorage.getItem(this.baseKey) === null) localStorage.setItem(this.baseKey, this.contentHash || '');
    localStorage.setItem(this.draftKey, JSON.stringify(candidate));
    this.dataset = candidate; this.draft = true;
  }
  async refreshFiles() {
    this.files = await pending.pendingListFiles(this.tree) as string[];
    this.deletions = await pending.pendingListDeletions(this.tree) as string[];
    const assets = new Map<string, string>(), urls: string[] = [];
    for (const key of this.files) {
      const entry = await pending.pendingGetFile(key, this.tree); if (!entry) continue;
      const url = URL.createObjectURL(new Blob([entry.blob], { type: entry.type })); urls.push(url);
      const path = key.startsWith('photos/') ? `/${key}` : key.startsWith('chronicle/') ? `/${key}` : `/sources/${key}`;
      assets.set(path, url);
    }
    this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls = urls; this.assets = assets;
  }
  private async fileOperation(operation: () => Promise<void>) {
    this.fileBusy++;
    try { await operation(); } finally { this.fileBusy--; }
  }
  async stageFile(name: string, blob: Blob) {
    if (!this.admin || this.saving) throw new Error(this.t.get('editUnavailable'));
    await this.fileOperation(async () => {
      await pending.pendingPutFile(name, blob, this.tree); await pending.pendingClearDeletion(name, this.tree); await this.refreshFiles();
    });
  }
  async releasePhoto(url: string) {
    if (!url.startsWith('/photos/') || Object.values(this.dataset.people).some(p => p.photo === url)) return;
    await this.fileOperation(async () => {
      const key = url.slice(1);
      if (this.files.includes(key)) await pending.pendingRemoveFile(key, this.tree); else await pending.pendingQueueDeletion(key, this.tree);
      await this.refreshFiles();
    });
  }
  async deleteSource(url: string) {
    if (!this.admin || this.saving || this.fileBusy) throw new Error(this.t.get('editUnavailable'));
    const base = sourceBase(url), variants = ['pt', 'en'].map(code => sourceVariant(base, code)).filter((path): path is string => !!path);
    const count = url === base ? countSourceLinks(this.dataset.people, base) : 0;
    if (!confirm(this.t.get(count ? 'sourceDeleteLinked' : 'sourceDeleteUnlinked', { n: count }))) return;
    await this.fileOperation(async () => {
      if (url === base) this.edit(data => {
        removeSourceLinks(data.people, base);
        for (const variant of variants) removeSourceLinks(data.people, variant);
        if (!url.startsWith('/sources/')) { setSourceCategory(data, base, 'andere'); removeSourceDetails(data, base); }
      });
      if (url.startsWith('/sources/')) {
        const targets = url === base ? [base, ...variants.filter(path => this.sourceFiles.has(path))] : [url];
        const other = [...new Set([base, ...variants].flatMap(path => Object.entries(this.sourceLinks[path] || {})
          .filter(([tree, n]) => tree !== this.tree && n > 0).map(([tree]) => tree)))];
        if (other.length) alert(this.t.get('sourceKeptOtherTrees', { trees: other.join(', ') }));
        else if (targets.every(path => this.files.includes(path.slice(9))) || confirm(this.t.get('sourceDeleteFile'))) {
          for (const target of targets) {
            const name = target.slice(9);
            if (this.files.includes(name)) await pending.pendingRemoveFile(name, this.tree);
            if (this.publishedSources.includes(target)) await pending.pendingQueueDeletion(name, this.tree);
          }
          if (url === base) this.edit(data => { setSourceCategory(data, base, 'andere'); removeSourceDetails(data, base); });
        }
        await this.refreshFiles();
      }
    });
  }
  async sync() {
    if (!this.admin || this.saving || this.fileBusy) return;
    if (this.legacyPending) { alert(this.t.get('legacyPendingUnassigned')); return; }
    this.saving = true;
    try {
      const deletedSources = [...this.deletions];
      const uploadedSources = [...this.assets.keys()].filter(url => url.startsWith('/sources/'));
      const result = await syncArchive({ data: this.snapshot(), tree: this.tree, create: this.isNew, baseHash: localStorage.getItem(this.baseKey) || this.contentHash },
        (key, values) => { this.progress = this.t.get(key, values); });
      localStorage.removeItem(this.draftKey); localStorage.removeItem(this.baseKey);
      this.publishedSources = [...new Set([...this.publishedSources, ...uploadedSources])];
      this.contentHash = result.contentHash || this.contentHash; this.draft = false; this.isNew = false;
      await this.refreshFiles();
      this.publishedSources = this.publishedSources.filter(url => !deletedSources.some(name => url === `/sources/${name}` && !this.deletions.includes(name)));
      const message = result.mode === 'local'
        ? this.t.get('savedLocal', { target: result.branch || this.t.get('savedWorkingDirectory'), commit: result.commit || this.t.get('savedNoCommit') })
        : this.t.get('saved', { commit: result.commit || this.t.get('savedFallback') }) + (result.branch ? this.t.get('savedBranch', { branch: result.branch }) : '');
      alert(message + (result.gitWarning ? this.t.get('savedGitWarning', { warning: result.gitWarning }) : '')
        + (result.deleteWarnings.length ? this.t.get('syncDeleteWarn', { list: result.deleteWarnings.join('\n') }) : ''));
    } catch (error) { await this.refreshFiles(); alert(`${error instanceof Error ? error.message : error}${this.t.get('saveErrorHint')}`); }
    finally { this.saving = false; this.progress = ''; }
  }
  async discard() {
    if (!confirm(this.t.get('discardConfirm'))) return;
    localStorage.removeItem(this.draftKey); localStorage.removeItem(this.baseKey);
    for (const name of await pending.pendingListFiles(this.tree) as string[]) await pending.pendingRemoveFile(name, this.tree);
    for (const name of await pending.pendingListDeletions(this.tree) as string[]) await pending.pendingClearDeletion(name, this.tree);
    location.reload();
  }
  dispose() { this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls = []; }
}
