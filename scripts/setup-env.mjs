// Copies .env.example to the two places that read a .env file. Never overwrites.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '.env.example');

for (const target of ['apps/web/.env', 'packages/db/.env']) {
  const path = join(root, target);
  if (existsSync(path)) {
    console.log(`kept    ${target} (already exists)`);
  } else {
    copyFileSync(source, path);
    console.log(`created ${target}`);
  }
}
console.log('Add your ANTHROPIC_API_KEY to both files if you need document generation.');
