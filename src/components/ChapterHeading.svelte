<script lang="ts">
  import { isSafeUrl } from '../../public/assets/chronicle.js';
  let { title, subtitle, cover, number, label, assets }: { title: string; subtitle?: string; cover?: string; number: number; label: string; assets: ReadonlyMap<string, string> } = $props();
</script>
{#if cover && isSafeUrl(cover)}<img class="chapter-cover" src={assets.get(cover) || cover} alt="" />{/if}
<header class="chapter-heading"><p class="chapter-kicker">{label} {number}</p><h2>{title}</h2>{#if subtitle}<p class="chapter-subtitle">{subtitle}</p>{/if}</header>
