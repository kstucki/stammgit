// HTTP integration checks. All writes go through the isolated synthetic launcher.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import YAML from 'yaml';

for (const mode of ['production', 'dev', 'demo']) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/serve-test.mjs'], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      STAMMGIT_TEST_PORT: String(port), STAMMGIT_TEST_MODE: mode,
      STAMMGIT_TEST_READONLY: mode === 'demo' ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = once(child, 'exit');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Fixture startup timed out\n${output}`)), 120_000);
      const read = chunk => {
        output += chunk;
        if (output.includes(`stammgit running at http://localhost:${port}`)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', read); child.stderr.on('data', read);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}\n${output}`)); });
    });
    const request = (path, options = {}) => fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(90_000), ...options });
    const login = async password => {
      const response = await request('/.netlify/functions/login', { method: 'POST', body: new URLSearchParams({ password }) });
      assert.equal(response.status, 303);
      return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    };
    const admin = await login('fixture-admin'), reader = await login('fixture-reader');
    const get = (path, cookie = admin) => request(path, { headers: { cookie } });
    const post = (fn, data, cookie = admin) => request(`/.netlify/functions/${fn}`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(data),
    });
    assert.equal((await request('/data/trees/demo.json')).status, 302);
    assert.equal((await post('save-family', {}, reader)).status, 403);
    const html = await (await get('/')).text();
    assert.ok(html.includes('svelte-app'));
    assert.ok(!html.includes('/assets/app.js'));
    const script = html.match(/src="([^" ]+(?:\.js|\.ts))"/)[1];
    assert.equal((await get(script)).status, 200);
    assert.equal((await get('/assets/does-not-exist.js')).status, 404);
    assert.equal((await get('/sources/test.pdf', reader)).status, 200);
    const source = await (await get('/data/trees/demo.yaml')).text();
    const data = YAML.parse(source);
    const index = await (await get('/data/trees/index.json')).json();
    const baseHash = index.trees.find(tree => tree.id === 'demo').contentHash;
    assert.ok(baseHash);
    data.people.person_a.occupation = `Saved by ${mode} fixture`;
    if (mode === 'demo') {
      for (const fn of ['save-family', 'upload-source', 'delete-source', 'download-sources']) {
        assert.equal((await post(fn, { tree: 'demo', data })).status, 503, `${fn} must require explicit credentials`);
      }
      assert.equal(await (await get('/data/trees/demo.yaml')).text(), source);
    } else {
      const response = await post('save-family', { tree: 'demo', data, baseHash });
      const saved = await response.json();
      assert.equal(response.status, 200, JSON.stringify(saved));
      assert.equal(saved.mode, 'local'); assert.equal(saved.branch, 'fixture-save'); assert.ok(saved.commit);
      assert.equal(YAML.parse(await (await get('/data/trees/demo.yaml')).text()).people.person_a.occupation, data.people.person_a.occupation);
      assert.equal((await post('save-family', { tree: 'demo', data, baseHash })).status, 409);
      // File-reference errors must roll back YAML after the full build rejects it.
      const invalid = structuredClone(data); invalid.people.person_a.photo = '/photos/missing.jpg';
      assert.equal((await post('save-family', { tree: 'demo', data: invalid, baseHash: saved.contentHash })).status, 422);
      assert.deepEqual(YAML.parse(await (await get('/data/trees/demo.yaml')).text()), data);
      const chapter = '---\ntitle: Synthetic chapter\n---\n\n[[p:person_a]] [[s:/sources/test.pdf]]';
      const chapterIndex = 'chapters: [intro.md, smoke.md]\n';
      for (const [filename, text] of [['smoke.md', chapter], ['index.yaml', chapterIndex]]) {
        assert.equal((await post('upload-source', { kind: 'chronicle', tree: 'demo', filename, contentBase64: Buffer.from(text).toString('base64') })).status, 200);
      }
      assert.equal((await post('save-family', { tree: 'demo', data, baseHash: saved.contentHash })).status, 200);
      const chapters = await (await get('/data/chronicle-demo.json')).json();
      assert.deepEqual(chapters.chapters.map(chapter => chapter.file), ['intro.md', 'smoke.md']);
      assert.equal(await (await get('/chronicle/demo/smoke.md')).text(), chapter);
      assert.equal((await post('upload-source', { kind: 'source', filename: 'temporary.pdf', contentBase64: Buffer.from('%PDF synthetic').toString('base64') })).status, 200);
      assert.equal((await get('/sources/temporary.pdf')).status, 200);
      assert.equal((await post('delete-source', { kind: 'source', filename: 'temporary.pdf' })).status, 200);
      assert.equal((await get('/sources/temporary.pdf')).status, 404);
    }
    console.log(`${mode}: entry/assets, auth, data and ${mode === 'demo' ? 'disabled hosted writes' : 'isolated saves, Git branch, conflicts, rollback, chapters, uploads/deletions'} passed`);
  } finally {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    await exited; clearTimeout(timer);
  }
}
