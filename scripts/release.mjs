#!/usr/bin/env node
/**
 * Interactive release helper. Chains: version bump -> (optional) git commit ->
 * EAS build (with optional auto-submit to the stores). Run with `npm run release`.
 *
 * The marketing version lives in package.json (app.config.ts reads it); EAS
 * auto-increments the build number itself, so we only bump semver here.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// This is an interactive tool — a TTY is required. Bail clearly otherwise so
// a piped/CI invocation can't half-apply a bump and then stall on a prompt.
if (!input.isTTY) {
  console.error('npm run release is interactive — run it in a terminal.');
  process.exit(1);
}

const rl = createInterface({ input, output });

function run(cmd) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

function pkgVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}

async function choose(question, choices, fallback) {
  const ans = (await rl.question(`${question} [${choices.join('/')}]${fallback ? ` (${fallback})` : ''}: `))
    .trim()
    .toLowerCase();
  if (!ans && fallback) return fallback;
  if (choices.includes(ans)) return ans;
  console.log(`  ↳ "${ans}" isn't one of ${choices.join(', ')} — try again.`);
  return choose(question, choices, fallback);
}

async function confirm(question, fallback = 'y') {
  const ans = (await rl.question(`${question} [y/n] (${fallback}): `)).trim().toLowerCase() || fallback;
  return ans === 'y' || ans === 'yes';
}

try {
  console.log(`\nSurfVault release — current version: ${pkgVersion()}\n`);

  // 1) Version bump
  const bump = await choose('Version bump?', ['patch', 'minor', 'major', 'skip'], 'patch');
  if (bump !== 'skip') {
    run(`npm version ${bump} --no-git-tag-version`);
  }
  const version = pkgVersion();
  console.log(`\n→ Releasing version ${version}\n`);

  // 2) Optional commit of the bump (EAS builds from your git state)
  if (bump !== 'skip' && (await confirm('Commit the version bump?'))) {
    run(`git add package.json package-lock.json 2>/dev/null || git add package.json`);
    run(`git commit -m "release v${version}"`);
  }

  // 3) Platform + submit
  const platformChoice = await choose('Platform?', ['ios', 'android', 'both'], 'both');
  const platform = platformChoice === 'both' ? 'all' : platformChoice;
  const autoSubmit = await confirm('Submit to the store(s) after build?');

  // 4) Confirm + run
  const submitFlag = autoSubmit ? ' --auto-submit' : '';
  const cmd = `eas build --profile production --platform ${platform}${submitFlag}`;
  console.log('\n──────────────────────────────────────────────');
  console.log(`Version:   ${version}`);
  console.log(`Platform:  ${platform}`);
  console.log(`Submit:    ${autoSubmit ? 'yes (auto-submit)' : 'no (build only)'}`);
  console.log(`Command:   ${cmd}`);
  console.log('──────────────────────────────────────────────\n');

  if (!(await confirm('Proceed?'))) {
    console.log('Aborted. (Any version bump/commit above is already applied.)');
    rl.close();
    process.exit(0);
  }

  rl.close();
  run(cmd);

  console.log(`\n✅ Release ${version} kicked off.`);

  // SQL to force older users onto this build — scoped to the platform(s) you
  // just released so you only raise the floor for what's actually live.
  const keys =
    platform === 'all' ? ['min_app_version_ios', 'min_app_version_android']
    : platform === 'ios' ? ['min_app_version_ios']
    : ['min_app_version_android'];
  const keyList = keys.map((k) => `'${k}'`).join(', ');
  console.log('\nWhen the build is live on the store(s), force older users onto it with:');
  console.log(`  UPDATE app_config SET value = '${version}', updated_at = NOW()`);
  console.log(`  WHERE key IN (${keyList});\n`);
} catch (err) {
  rl.close();
  console.error(`\n✗ Release failed: ${err.message}`);
  process.exit(1);
}
