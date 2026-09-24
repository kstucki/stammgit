<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Workspace } from '../state/workspace.svelte';
  import type { Dataset } from '../domain/person';
  import { sourceUrl } from '../data/family';
  import { loadImageFile, makeCropper } from '../data/images.js';
  let { store, id, commit }: { store: Workspace; id: string; commit(operation?: (data: Dataset) => void): void } = $props();
  let canvas = $state<HTMLCanvasElement>(), zoom = $state<HTMLInputElement>(), files = $state<FileList>();
  let cropper: ReturnType<typeof makeCropper> | null = null, image: HTMLImageElement | null = null;
  let cropping = $state(false), busy = $state(false), status = $state('');
  let generation = 0;
  const release = () => { if (image) URL.revokeObjectURL(image.src); image = null; cropper = null; };
  onDestroy(() => { generation++; release(); });
  async function choose() {
    const current = ++generation; release(); cropping = false;
    const file = files?.[0]; if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) { status = store.t.get('photoBadType'); return; }
    try {
      const decoded = await loadImageFile(file) as HTMLImageElement;
      if (current !== generation) { URL.revokeObjectURL(decoded.src); return; }
      image = decoded; cropping = true; await tick();
      zoom!.value = '1'; cropper = makeCropper(canvas!, image, zoom!); status = store.t.get('photoCropHint');
    } catch (error) { status = String(error instanceof Error ? error.message : error); }
  }
  async function apply() {
    if (!cropper) { status = store.t.get('photoNeedFile'); return; } busy = true;
    try {
      const blob = await cropper.cropToBlob(800) as Blob, name = `${id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}-${Date.now().toString(36)}.jpg`;
      const old = store.dataset.people[id].photo;
      await store.stageFile(`photos/${name}`, blob); commit(data => { data.people[id].photo = `/photos/${name}`; });
      if (old) await store.releasePhoto(old); cropping = false; release(); status = store.t.get('photoStoredLocally');
    } catch (error) { status = String(error instanceof Error ? error.message : error); } finally { busy = false; }
  }
  async function remove() { const old = store.dataset.people[id].photo; commit(data => { delete data.people[id].photo; }); if (old) await store.releasePhoto(old); }
</script>
<section class="relation-box"><h3>{store.t.get('photo')}</h3>
  <div class="toolbar">{#if store.dataset.people[id].photo}<img class="portrait" src={sourceUrl(store.dataset.people[id].photo!, store.assets)} alt="" /><button type="button" id="photoRemove" onclick={() => remove().catch(error => { status = error.message; })}>{store.t.get('photoRemove')}</button>{/if}
    <input id="photoFile" type="file" accept="image/*" bind:files={files} onchange={choose} aria-label={store.t.get('photo')} />
  </div>
  {#if cropping}<div class="photo-crop" id="photoCrop">
    <canvas id="photoCanvas" bind:this={canvas} width="600" height="600"></canvas>
    <label>{store.t.get('photoZoom')}<input id="photoZoom" bind:this={zoom} type="range" min="1" max="3" step="0.01" value="1" /></label>
    <button type="button" id="photoUpload" disabled={busy} onclick={apply}>{store.t.get('photoSet')}</button>
  </div>{/if}<p id="photoStatus" role="status">{status || store.t.get('photoHint')}</p>
</section>
