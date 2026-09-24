import { getT } from '../../public/assets/strings.js';
import { validateDataset } from '../../netlify/shared/validate.mjs';
import * as pending from '../../public/assets/pending.js';
import { countSourceLinks, removeSourceLinks } from '../../public/assets/model.js';
import { syncArchive } from '../data/sync';
import { hydrateChronicle } from '../data/chronicle';
import type { ArchiveSnapshot, TreeIndex } from '../domain/archive';
import type { Dataset, ChronicleIndex } from '../domain/person';
import type { FamilySession } from '../data/family';

export class Workspace {
  dataset = $state<Dataset>({ meta: { focusPersonId: '' }, people: {} });
  chronicle = $state<ChronicleIndex | null>(null);
  assets = $state<ReadonlyMap<string, string>>(new Map());
  files = $state<string[]>([]);
  deletions = $state<string[]>([]);
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
  readonly t: ReturnType<typeof getT>;
  private urls: string[] = [];
  constructor(archive: ArchiveSnapshot, session: FamilySession) {
    this.archive = archive; this.t = getT(archive.config.language === 'en' ? 'en' : 'de');
    this.dataset = session.dataset; this.draft = session.hasDraft; this.chronicle = session.chronicle;
  }
  get tree() { return this.archive.tree.id; }
  get admin() { return this.archive.role === 'admin'; }
  get pending() { return this.draft || this.files.length > 0 || this.deletions.length > 0; }
  get session(): FamilySession { return { dataset: this.dataset, chronicle: this.chronicle, assets: this.assets, hasDraft: this.draft }; }
  get draftKey() { return `familyTreeDraft:${this.tree}`; }
  get baseKey() { return `familyTreeDraftBase:${this.tree}`; }
  snapshot(): Dataset { return $state.snapshot(this.dataset) as Dataset; }
  async initialize() {
    this.index = this.archive.index || await (await fetch('/data/trees/index.json', { cache: 'no-store' })).json();
    const links = await fetch('/data/source-links.json', { cache: 'no-store' });
    this.sourceLinks = links.ok ? await links.json() : {};
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
    const count = countSourceLinks(this.dataset.people, url);
    if (!confirm(this.t.get(count ? 'sourceDeleteLinked' : 'sourceDeleteUnlinked', { n: count }))) return;
    await this.fileOperation(async () => {
      this.edit(data => removeSourceLinks(data.people, url));
      if (url.startsWith('/sources/')) {
        const name = url.slice(9), other = Object.entries(this.sourceLinks[url] || {}).filter(([tree, n]) => tree !== this.tree && n > 0).map(([tree]) => tree);
        if (this.files.includes(name)) await pending.pendingRemoveFile(name, this.tree);
        else if (other.length) alert(this.t.get('sourceKeptOtherTrees', { trees: other.join(', ') }));
        else if (confirm(this.t.get('sourceDeleteFile'))) await pending.pendingQueueDeletion(name, this.tree);
        await this.refreshFiles();
      }
    });
  }
  async sync() {
    if (!this.admin || this.saving || this.fileBusy) return;
    if (this.legacyPending) { alert(this.t.get('legacyPendingUnassigned')); return; }
    this.saving = true;
    try {
      const result = await syncArchive({ data: this.snapshot(), tree: this.tree, create: this.isNew, baseHash: localStorage.getItem(this.baseKey) || this.contentHash },
        (key, values) => { this.progress = this.t.get(key, values); });
      localStorage.removeItem(this.draftKey); localStorage.removeItem(this.baseKey);
      this.contentHash = result.contentHash || this.contentHash; this.draft = false; this.isNew = false;
      await this.refreshFiles();
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
