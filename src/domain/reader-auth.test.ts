import { afterEach, describe, expect, it, vi } from 'vitest';
import { readersFromConfig, sessionForPassword, roleFromCookieValue, tokenFor } from '../../netlify/shared/token.mjs';
import login from '../../netlify/functions/login.mjs';
import { requireAdmin, roleFromRequest } from '../../netlify/functions/_auth.mjs';
import gate from '../../netlify/edge-functions/auth.js';
const admin = 'test-admin-secret';
const raw = JSON.stringify({ first: 'first-reader-secret', second: 'second-reader-secret' });
let edgeReaders = raw;
const configure = (readers = raw) => {
  edgeReaders = readers;
  vi.stubEnv('FAMILY_TREE_PASSWORD', admin);
  vi.stubEnv('FAMILY_TREE_READERS', readers);
  vi.stubEnv('FAMILY_TREE_USER_PASSWORD', 'old-reader-secret');
  vi.stubGlobal('Netlify', { env: { get: (key: string) => ({ FAMILY_TREE_PASSWORD: admin, FAMILY_TREE_READERS: edgeReaders, FAMILY_TREE_USER_PASSWORD: 'old-reader-secret' } as Record<string, string>)[key] } });
};
const request = (token: string, pathname = '/') => new Request(`https://example.test${pathname}`, { headers: { cookie: `family_tree_session=${token}` } });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('individually revocable reader access', () => {
  it('accepts distinct readers without exposing their passwords and preserves admin access', async () => {
    const a = await sessionForPassword(admin, 'first-reader-secret', raw);
    const b = await sessionForPassword(admin, 'second-reader-secret', raw);
    expect(a?.role).toBe('user'); expect(b?.role).toBe('user');
    expect(a?.token).not.toBe(b?.token); expect(a?.token).not.toContain('first-reader-secret');
    expect(await roleFromCookieValue(admin, a!.token, raw)).toBe('user');
    expect(await sessionForPassword(admin, 'wrong-password', raw)).toBeNull();
    expect(await roleFromCookieValue(admin, await tokenFor(admin, 'admin'), '{}')).toBe('admin');
  });
  it('revokes removed, renamed and changed readers, leaving other readers valid', async () => {
    const a = (await sessionForPassword(admin, 'first-reader-secret', raw))!.token;
    const b = (await sessionForPassword(admin, 'second-reader-secret', raw))!.token;
    for (const replacement of [
      { second: 'second-reader-secret' },
      { first: 'new-secret', second: 'second-reader-secret' },
      { renamed: 'first-reader-secret', second: 'second-reader-secret' },
    ]) {
      expect(await roleFromCookieValue(admin, a, JSON.stringify(replacement))).toBeNull();
      expect(await roleFromCookieValue(admin, b, JSON.stringify(replacement))).toBe('user');
    }
    expect(await roleFromCookieValue('changed-admin-secret', b, raw)).toBeNull();
    expect(await roleFromCookieValue(admin, a.replace('first.', 'second.'), raw)).toBeNull();
    expect(await roleFromCookieValue(admin, a.slice(0, -1) + 'x', raw)).toBeNull();
  });
  it('supports legacy password only until JSON is configured, and rejects old shared sessions', async () => {
    const session = await sessionForPassword(admin, 'old-reader-secret', undefined, 'old-reader-secret');
    expect(await roleFromCookieValue(admin, session!.token, undefined, 'old-reader-secret')).toBe('user');
    expect(await roleFromCookieValue(admin, session!.token, undefined, 'changed-secret')).toBeNull();
    expect(await roleFromCookieValue(admin, session!.token, '{}', 'old-reader-secret')).toBeNull();
    expect(await sessionForPassword(admin, 'old-reader-secret', raw, 'old-reader-secret')).toBeNull();
    expect(await roleFromCookieValue(admin, await tokenFor(admin, 'user'), raw, 'old-reader-secret')).toBeNull();
  });
  it.each(['', 'broken', 'null', '[]', '{"a":42}', '{"a":" "}', '{"bad.id":"secret"}', '{"a":"same","b":"same"}', JSON.stringify({ a: admin })])('fails closed for invalid reader configuration: %s', async invalid => {
    expect(() => readersFromConfig(admin, invalid, 'old-reader-secret')).toThrow('Invalid reader configuration.');
    const reader = (await sessionForPassword(admin, 'first-reader-secret', raw))!;
    expect(await roleFromCookieValue(admin, reader.token, invalid, 'old-reader-secret')).toBeNull();
    expect((await sessionForPassword(admin, admin, invalid))?.role).toBe('admin');
  });
  it('issues secure login cookies and enforces the same access at edge and function gates', async () => {
    configure();
    const response = await login(new Request('https://example.test/.netlify/functions/login', { method: 'POST', body: new URLSearchParams({ password: 'first-reader-secret' }) }));
    expect(response.status).toBe(303);
    const cookie = response.headers.getSetCookie().find((s: string) => s.startsWith('family_tree_session='))!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict');
    const token = cookie.split(';')[0].split('=')[1];
    expect(await roleFromRequest(request(token))).toBe('user');
    expect((await requireAdmin(request(token)))?.status).toBe(403);
    for (const path of ['/', '/sources/example.pdf', '/chronicle/demo/intro.md', '/data/trees/demo.json', '/.netlify/functions/test']) {
      expect(await gate(request(token, path), { cookies: { get: () => token } })).toBeUndefined();
    }
    vi.stubEnv('FAMILY_TREE_READERS', '{}');
    edgeReaders = '{}';
    expect(await roleFromRequest(request(token))).toBeNull();
    for (const path of ['/', '/sources/example.pdf', '/chronicle/demo/intro.md', '/data/trees/demo.json', '/.netlify/functions/test']) {
      const denied = await gate(request(token, path), { cookies: { get: () => token } });
      expect(denied?.status).toBe(302); expect(denied?.headers.get('location')).toContain('/login.html');
    }
  });
});
