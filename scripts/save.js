const { execSync } = require('child_process');
const os = require('os');

// Bake Monica's git identity into the script so it works on any machine
// without having to run `git config` manually.
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Monica Iskra',
  GIT_AUTHOR_EMAIL: 'monica@local',
  GIT_COMMITTER_NAME: 'Monica Iskra',
  GIT_COMMITTER_EMAIL: 'monica@local',
};

const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });
const out = (cmd) => execSync(cmd, { stdio: 'pipe', env }).toString().trim();

const hostname = os.hostname();
const when = new Date().toLocaleString('en-US', {
  timeZone: 'America/Detroit',
  dateStyle: 'short',
  timeStyle: 'short',
});

const dirty = out('git status --porcelain');

if (dirty) {
  console.log(`Staging changes...`);
  run('git add -A');
  console.log(`Committing as "${hostname}"...`);
  run(`git commit -m "Update from ${hostname} (${when})"`);
} else {
  console.log('No local changes to commit.');
}

console.log('Pulling any updates from the other machine...');
try {
  run('git pull --rebase');
} catch {
  console.log('\nMerge conflict — open the files marked above, fix them, then run: git rebase --continue && npm run save');
  process.exit(1);
}

console.log('Pushing to GitHub...');
run('git push');

console.log('\nDone. Vercel will rebuild https://my-re-hub.vercel.app/ in about a minute.');
