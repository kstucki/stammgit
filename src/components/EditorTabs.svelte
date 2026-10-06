<script lang="ts">
  let { id, label, items, value = $bindable() }: {
    id: string; label: string; items: { value: string; label: string }[]; value: string;
  } = $props();
  function move(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    value = items[next].value;
    (event.currentTarget as HTMLElement).parentElement!.querySelectorAll('button')[next].focus();
  }
</script>

<div class="editor-tabs" role="tablist" aria-label={label}>
  {#each items as item, i}
    <button type="button" role="tab" id={`${id}-tab-${item.value}`} aria-controls={`${id}-panel-${item.value}`}
      aria-selected={value === item.value} tabindex={value === item.value ? 0 : -1}
      onclick={() => value = item.value} onkeydown={event => move(event, i)}>{item.label}</button>
  {/each}
</div>
