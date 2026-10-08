import {execFileSync} from 'node:child_process';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const repo = resolve(import.meta.dirname, '../..');
const baseline = '1298734bd32b7a2ace641e4929454e272b6ba8cf';
const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024});
const [action, destination] = process.argv.slice(2);
if (!destination || !['snapshot', 'worktree', 'verify-web'].includes(action)) {
  throw Error('Usage: node recovery.mjs snapshot|worktree|verify-web ABSOLUTE_DESTINATION');
}
if (!destination.startsWith('/')) throw Error('Destination must be absolute');
const target = resolve(destination);
if (target === repo || target.startsWith(repo + '/')) throw Error('Use a destination outside the repository');

if (action === 'snapshot') {
  await mkdir(target, {recursive: true});
  const bundle = resolve(target, 'chargevoy-before-android-changes.bundle');
  git('bundle', 'create', bundle, '--all');
  git('bundle', 'verify', bundle);
  const bytes = await readFile(bundle);
  await writeFile(resolve(target, 'recovery-manifest.json'), JSON.stringify({
    baseline, capturedHead: git('rev-parse', 'HEAD').trim(),
    bundle: 'chargevoy-before-android-changes.bundle',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    packageId: 'app.chargevoy.mobile',
    createdAt: new Date().toISOString(),
    excludes: ['uncommitted files', 'APK/AAB binaries', 'production database', 'signing keys', 'provider configuration'],
  }, null, 2));
  console.log('Verified Git recovery snapshot created. Database and release artefacts require separate backups.');
} else if (action === 'worktree') {
  // No reset, clean, checkout over working files, deployment or DB restoration.
  git('worktree', 'add', '--detach', target, baseline);
  console.log('Recovery checkout created. Build Android there with the original signing identity and a higher Play versionCode.');
} else {
  const changed = git('diff', '--name-only', baseline, '--', 'ev-charge-portugal-github-ready', '.github/workflows');
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'ev-charge-portugal-github-ready', '.github/workflows');
  if (changed.trim() || untracked.trim()) throw Error('Website/shared workflows changed: ' + changed + untracked);
  console.log('Website and shared workflows match the pre-change baseline.');
}
