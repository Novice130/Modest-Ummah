const { spawnSync } = require('child_process');

// Environment variables are loaded by dotenv-cli before this script runs
const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const email = process.env.POCKETBASE_ADMIN_EMAIL;
const password = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Error: POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set in .env');
  process.exit(1);
}

console.log(`Generating types from: ${url}`);
console.log(`Email: ${email}`);
console.log(`Password length: ${password.length}`);

// Use npx to find the executable, but running it directly via spawn is cleaner if we use the bin path.
// However, npx is the easiest way to ensure we use the local version.
// On Windows, npx might be npx.cmd
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const args = [
  'pocketbase-typegen',
  '--url', url,
  '--email', email,
  '--password', password,
  '--out', 'types/pocketbase-types.ts'
];

const result = spawnSync(npx, args, { stdio: 'inherit', encoding: 'utf-8' });

if (result.status !== 0) {
  console.error('Type generation failed.');
  process.exit(result.status);
}
