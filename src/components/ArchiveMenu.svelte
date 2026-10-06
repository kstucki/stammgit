<script lang="ts">
  import { tick } from 'svelte';
  import PersonSearch from './PersonSearch.svelte';
  import type { Dataset } from '../domain/person';
  import NavigationIcon from './NavigationIcon.svelte';
  let { admin, language, portuguese, t, onlanguage, onlogout, people, me, onme }: {
    admin: boolean; language: string; portuguese: boolean;
    people: Dataset['people']; me: string; onme(id: string): void;
    t: { locale?: string; get(key: string, values?: Record<string, string | number>): string }; onlanguage(code: string): void; onlogout(): void;
  } = $props();
  let menu: HTMLDetailsElement;
  let section = $state<'identity' | 'language' | null>(null);
  async function openSection(next: 'identity' | 'language') {
    section = next;
    await tick();
    menu.querySelector<HTMLElement>(next === 'identity' ? '#menu-person' : '[data-language][aria-pressed="true"]')?.focus();
  }
  async function back() {
    const previous = section; section = null;
    await tick();
    menu.querySelector<HTMLButtonElement>(previous === 'identity' ? '[data-identity-menu]' : '[data-language-menu]')?.focus();
  }
  function finish() {
    menu.open = false; section = null;
    menu.querySelector('summary')?.focus();
  }
  function selectIdentity(id: string) { onme(id); finish(); }
  function close(event: PointerEvent) {
    if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) { menu.open = false; section = null; }
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' && menu?.open) {
      if (section) void back(); else finish();
    }
  }
</script>
<svelte:window onpointerdown={close} onkeydown={keyboard} />
<details class="archive-menu" bind:this={menu} ontoggle={() => { if (!menu.open) section = null; }}>
  <summary aria-label={t.get('archiveMenu')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></summary>
  <div class="archive-menu-panel" class:submenu-open={section !== null}>
    {#if section}
      <button class="menu-back" onclick={back}><NavigationIcon name="back" />{t.get('back')}</button>
      <h2 class="menu-section-title">{t.get(section === 'identity' ? 'identityQuestion' : 'archiveLanguage')}</h2>
      {#if section === 'identity'}
        <div class="identity-picker">
          {#if me}<p class="identity-current">{t.get('identityNamed', { name: people[me]?.name || me })}</p>{/if}
          <PersonSearch {people} {t} inputId="menu-person" label={t.get('identityQuestion')} oncenter={selectIdentity} />
          <p class="identity-help">{t.get('identityDeviceOnly')}</p>
          {#if me}<button class="identity-remove" onclick={() => selectIdentity('')}>{t.get('identityRemove')}</button>{/if}
        </div>
      {:else}
        <div class="archive-language-buttons" role="group" aria-label={t.get('archiveLanguage')}>
          {#each [{ code: 'de', name: 'Deutsch' }, { code: 'en', name: 'English' }, { code: 'pt', name: 'Português' }] as choice}
            <button data-language={choice.code} aria-pressed={language === choice.code} disabled={choice.code === 'pt' && !portuguese}
              onclick={() => { if (language !== choice.code) onlanguage(choice.code); finish(); }}>
              <span>{choice.name}</span>{#if language === choice.code}<NavigationIcon name="check" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <button class="menu-row" data-language-menu onclick={() => openSection('language')}>
        <NavigationIcon name="language" /><span class="menu-label">{t.get('archiveLanguage')}</span><span class="menu-value">{language === 'pt' ? 'Português' : language === 'en' ? 'English' : 'Deutsch'}</span><NavigationIcon name="chevron" />
      </button>
      <button class="menu-row" data-identity-menu onclick={() => openSection('identity')}>
        <NavigationIcon name="person" /><span class="menu-label">{me ? t.get('identityNamed', { name: people[me]?.name || me }) : t.get('identityMenu')}</span><NavigationIcon name="chevron" />
      </button>
      <a class="menu-row" href="/?view=sources" data-view="sources" onclick={finish}><NavigationIcon name="sources" /><span class="menu-label">{t.get('archiveDocuments')}</span></a>
      {#if admin}<a class="menu-row" href="/?view=admin" data-view="admin" onclick={finish}><NavigationIcon name="admin" /><span class="menu-label">{t.get('tabAdmin')}</span></a>{/if}
      <div class="menu-logout"><button class="menu-row" onclick={() => { finish(); onlogout(); }}><NavigationIcon name="logout" /><span class="menu-label">{t.get('logout')}</span></button></div>
    {/if}
  </div>
</details>
