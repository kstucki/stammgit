<script lang="ts">
  import { untrack } from 'svelte';
  import PersonSearch from '../components/PersonSearch.svelte';
  import NavigationIcon from '../components/NavigationIcon.svelte';
  import type { Dataset } from '../domain/person';
  let { people, me, t, oncontinue }: {
    people: Dataset['people']; me: string;
    t: { locale?: string; get(key: string, values?: Record<string, string | number>): string };
    oncontinue(id: string): void;
  } = $props();
  let chosen = $state(untrack(() => me));
  const tips = [
    { icon: 'family', heading: 'welcomeCenterHeading', text: 'welcomeTipCenter' },
    { icon: 'info', heading: 'welcomeInfoHeading', text: 'welcomeTipInfo' },
    { icon: 'chronicle', heading: 'welcomeChronicleHeading', text: 'welcomeTipNavigation' },
  ];
</script>

<main class="welcome-page">
  <section class="welcome-card" aria-labelledby="welcome-title">
    <header class="welcome-heading">
      <svg class="welcome-motif" width="112" height="54" viewBox="0 0 112 54" fill="none" aria-hidden="true">
        <path d="M30 13v13h52V13M56 26v15" stroke="currentColor" stroke-width="1.5" />
        <circle cx="30" cy="10" r="8" class="motif-leaf" />
        <circle cx="82" cy="10" r="8" class="motif-leaf" />
        <circle cx="56" cy="45" r="8" fill="currentColor" />
      </svg>
      <h1 id="welcome-title">{t.get('welcomeTitle')}</h1>
      <p class="welcome-intro">{t.get('welcomeIntro')}</p>
    </header>
    <ul class="welcome-tips">
      {#each tips as tip}
        <li>
          <span class="welcome-tip-icon"><NavigationIcon name={tip.icon} /></span>
          <div><h2>{t.get(tip.heading)}</h2><p>{t.get(tip.text)}</p></div>
        </li>
      {/each}
    </ul>
    <section class="welcome-identity" aria-labelledby="welcome-identity-title">
      <h2 id="welcome-identity-title">{t.get('identityQuestion')}</h2>
      <p class="identity-help">{t.get('identityDeviceOnly')}</p>
      <PersonSearch {people} {t} inputId="welcome-person" label={t.get('identityQuestion')} oncenter={id => chosen = id} />
      {#if chosen && people[chosen]}
        <div class="identity-chip"><span>{people[chosen].name || chosen}</span><button type="button" aria-label={t.get('identityRemove')} onclick={() => chosen = ''}>×</button></div>
      {/if}
    </section>
    <button class="welcome-continue" onclick={() => oncontinue(chosen && people[chosen] ? chosen : '')}>{t.get('welcomeContinue')}<NavigationIcon name="chevron" /></button>
  </section>
</main>

<style>
  .welcome-page { min-height: 100dvh; display: grid; place-items: center; padding: 32px 20px; }
  .welcome-card { width: 100%; max-width: 36rem; padding: 32px 40px; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 12px 48px var(--shadow-soft); }
  .welcome-heading { text-align: center; }
  .welcome-motif { color: var(--primary); margin-bottom: 12px; }
  .motif-leaf { fill: var(--fan-branch); stroke: var(--primary); stroke-width: 1.5; }
  h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 2.4rem); line-height: 1.12; text-wrap: balance; }
  .welcome-intro { color: var(--text-muted); font-size: .95rem; margin: 12px 0 0; text-wrap: balance; }
  .welcome-tips { list-style: none; padding: 0; margin: 28px 0; display: grid; gap: 20px; }
  .welcome-tips li { display: flex; align-items: flex-start; gap: 14px; }
  .welcome-tip-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; color: var(--primary); background: var(--surface-muted); }
  h2 { margin: 0; font: 600 .95rem/1.4 var(--font-sans); }
  .welcome-tips p { margin: 4px 0 0; font-size: .875rem; line-height: 1.5; color: var(--text-muted); }
  .welcome-identity { padding: 16px; background: var(--surface-muted); border-radius: 12px; }
  .welcome-identity .identity-help { margin: 4px 0 12px; font-size: .8rem; line-height: 1.5; }
  .welcome-continue { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 50px; margin-top: 20px; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-contrast); font-weight: 600; }
  :global(.welcome-card .family-search) { max-width: none; }
  :global(.welcome-card .family-results) { position: static; max-height: min(16rem, 35dvh); }
  :global(.welcome-card .family-search input) { font-size: 16px; }
  @media (max-width: 599px) {
    .welcome-page { padding: 16px 20px; }
    .welcome-card { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
    .welcome-tips { gap: 12px; margin: 18px 0; }
    .welcome-tips li { gap: 12px; }
    .welcome-tip-icon { width: 32px; height: 32px; border-radius: 10px; }
    .welcome-identity { padding: 12px; }
    .welcome-continue { margin-top: 14px; }
    .welcome-motif { height: 32px; margin-bottom: 6px; }
  }
</style>
