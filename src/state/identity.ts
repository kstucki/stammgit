import type { Dataset } from '../domain/person';

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function deviceStorage(): DeviceStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
export function readMe(people: Dataset['people'], storage = deviceStorage()): string {
  try {
    const id = storage?.getItem('stammbaum.me') || '';
    if (id && !Object.hasOwn(people, id)) { storage?.removeItem('stammbaum.me'); return ''; }
    return id;
  } catch { return ''; }
}
export function saveMe(id: string, storage = deviceStorage()): void {
  try {
    if (id) storage?.setItem('stammbaum.me', id);
    else storage?.removeItem('stammbaum.me');
  } catch { /* Identity remains optional and works in memory for this visit. */ }
}
export function welcomeSeen(storage = deviceStorage()): boolean {
  try { return storage?.getItem('stammbaum.welcomeSeen') === 'true'; } catch { return false; }
}
export function rememberWelcome(storage = deviceStorage()): void {
  try { storage?.setItem('stammbaum.welcomeSeen', 'true'); } catch { /* Ask again on the next visit. */ }
}
