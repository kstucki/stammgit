import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// Only synthetic content enters the writable test checkout. Never copy .env,
// .git, the production data, source documents, portraits.
const source = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'stammgit-browser-'));
let child;
const clean = () => fs.rmSync(fixture, { recursive: true, force: true });
process.on('exit', clean);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (child) child.kill(signal);
  else process.exit(0);
});

for (const item of ['package.json', 'package-lock.json', 'server.mjs', 'index.html', 'vite.config.ts', 'svelte.config.js',
  'vitest.config.ts', 'tsconfig.json', 'tsconfig.tools.json', 'src', 'scripts', 'netlify']) {
  fs.cpSync(path.join(source, item), path.join(fixture, item), { recursive: true });
}
fs.symlinkSync(path.join(source, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
fs.mkdirSync(path.join(fixture, 'public/assets'), { recursive: true });
for (const entry of fs.readdirSync(path.join(source, 'public/assets'), { withFileTypes: true })) {
  if (entry.name === 'vendor' || entry.name === 'source-thumbnails.json' || /\.(js|css)$/.test(entry.name)) {
    fs.cpSync(path.join(source, 'public/assets', entry.name), path.join(fixture, 'public/assets', entry.name), { recursive: true });
  }
}
for (const page of ['legacy.html', 'login.html']) fs.copyFileSync(path.join(source, 'public', page), path.join(fixture, 'public', page));
fs.cpSync(path.join(source, 'tests/fixtures/archive'), fixture, { recursive: true });
// Explicit environment allow-list: no inherited tokens, hosted flags or .env.
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR || os.tmpdir(),
  NODE_ENV: 'test',
  PORT: process.env.STAMMGIT_TEST_PORT || '18988',
  FAMILY_TREE_PASSWORD: 'fixture-admin',
  FAMILY_TREE_USER_PASSWORD: 'fixture-reader',
  LOCAL_WRITE: process.env.STAMMGIT_TEST_READONLY === '1' ? '0' : '1',
  LOCAL_GIT: '1',
  GIT_AUTHOR_NAME: 'Fixture Tests',
  GIT_AUTHOR_EMAIL: 'fixtures@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture Tests',
  GIT_COMMITTER_EMAIL: 'fixtures@example.invalid',
  GITHUB_TOKEN: '',
  GITHUB_REPO: '',
  GITHUB_BRANCH: 'never-production',
};
// A fresh repository without remotes proves that local sync uses the checked-out
// branch, independently of GITHUB_BRANCH. No real history or identity is copied.
const git = spawnSync('git', ['init', '--quiet', '--initial-branch=fixture-save'], { cwd: fixture, env, stdio: 'inherit' });
if (git.status !== 0) process.exit(git.status || 1);
const build = spawnSync('npm', ['run', 'build'], { cwd: fixture, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
console.log('Serving isolated browser fixtures (local file writes only).');
child = spawn(process.execPath, ['server.mjs', ...(process.env.STAMMGIT_TEST_MODE === 'dev' ? ['--dev'] : [])], {
  cwd: fixture, env, stdio: 'inherit',
});
child.on('exit', (code, signal) => process.exit(signal ? 0 : (code || 0)));
