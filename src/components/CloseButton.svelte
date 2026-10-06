<script lang="ts">
  let { label, onclick, class: className = '' }: { label: string; onclick(): void; class?: string } = $props();
</script>

<button type="button" class={`dialog-close close-button ${className}`} aria-label={label} {onclick}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
</button>

<style>
  button.close-button { display: grid; place-items: center; flex: 0 0 40px; width: 40px; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--primary); }
  button.close-button:hover { background: var(--surface-muted); }
</style>
