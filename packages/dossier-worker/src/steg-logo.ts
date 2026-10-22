import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Default location, resolved from the module so it works from `src` and from `dist`. */
const DEFAULT_LOGO_PATH = fileURLToPath(new URL('./assets/steg-logo.png', import.meta.url));

/** Reads the committed STEG logo. Throws when the file is missing. `path` is for tests. */
export async function loadStegLogo(path: string = DEFAULT_LOGO_PATH): Promise<Buffer> {
  return readFile(path);
}

/** Like loadStegLogo, but returns null only when the file is missing; other errors propagate. */
export async function tryLoadStegLogo(path: string = DEFAULT_LOGO_PATH): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
