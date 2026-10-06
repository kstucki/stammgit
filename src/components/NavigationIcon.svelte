<script lang="ts">let { name }: { name: string } = $props();</script>
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'family'}<path d="M12 7v5M5 17v-5h14v5"/><circle cx="12" cy="4" r="3"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/>
  {:else if name === 'chronicle'}<path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1Z"/>
  {:else if name === 'sources'}<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/>
  {:else if name === 'admin'}<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3M16 3l3-2 3 2v5l-3 2-3-2Z"/>
  {:else if name === 'language'}<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>
  {:else if name === 'person'}<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
  {:else if name === 'info'}<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>
  {:else if name === 'back'}<path d="m14 5-7 7 7 7M7 12h14"/>
  {:else if name === 'chevron'}<path d="m9 6 6 6-6 6"/>
  {:else if name === 'check'}<path d="m5 12 4 4L19 6"/>
  {:else if name === 'logout'}<path d="M10 3H3v18h7M8 12h13m-5-5 5 5-5 5"/>{/if}
</svg>
