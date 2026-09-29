<script lang="ts">
  import { tick, untrack } from 'svelte';
  let { inputId, label, placeholder = label, query = $bindable(''), options, onchoose, onadd, addLabel, noResults, showEmpty = false }: {
    inputId: string; label: string; placeholder?: string; query?: string;
    options: { id: string; label: string; detail?: string }[]; onchoose(id: string): void;
    onadd?(id: string): void; addLabel?(name: string): string; noResults: string; showEmpty?: boolean;
  } = $props();
  let active = $state(0), open = $state(untrack(() => showEmpty));
  let list = $state<HTMLUListElement>();
  let expanded = $derived(open && (showEmpty || !!query.trim()));
  let selected = $derived(options[Math.min(active, Math.max(0, options.length - 1))]);
  function input() { active = 0; open = true; }
  function choose(id: string) { onchoose(id); open = false; query = ''; }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (expanded) open = false; else { query = ''; open = false; }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) { open = true; active = 0; }
      else active = Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      void tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter' && expanded && selected) { event.preventDefault(); choose(selected.id); }
    else if (event.key === 'Tab') open = false;
  }
</script>
<div class="family-search" onfocusout={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) open = false; }}>
  <label class="visually-hidden" for={inputId}>{label}</label>
  <input id={inputId} type="search" bind:value={query} {placeholder} autocomplete="off" role="combobox"
    aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${inputId}-results`}
    aria-activedescendant={expanded && selected ? `${inputId}-option-${options.indexOf(selected)}` : undefined}
    oninput={input} onkeydown={keydown} onfocus={() => open = true} />
  {#if expanded}
    <ul bind:this={list} id={`${inputId}-results`} class="family-results" role="listbox" aria-label={label}>
      {#each options as option, i (option.id)}
        <!-- svelte-ignore a11y_mouse_events_have_key_events (Arrows move the active descendant while focus stays on the input.) -->
        <li id={`${inputId}-option-${i}`} role="option" aria-selected={selected?.id === option.id} onmouseover={() => active = i}>
          <button tabindex="-1" type="button" data-search-person={option.id} data-pick={option.id} onclick={() => choose(option.id)}>{option.label}{#if option.detail}<span>{option.detail}</span>{/if}</button>
          {#if onadd}<button type="button" class="add-root" aria-label={addLabel?.(option.label)} onclick={() => { onadd?.(option.id); query = ''; open = false; }}>+</button>{/if}
        </li>
      {/each}
    </ul>
    {#if !options.length}<span role="status">{noResults}</span>{/if}
  {/if}
</div>
