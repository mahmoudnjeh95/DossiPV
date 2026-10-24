import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Next.js refuses to build when a "use server" file exports anything but async functions (types are
 * fine): the whole app then fails, not only that page, and no unit test imports the real file in a
 * way that notices. This reads the sources instead.
 */
const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === 'test') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const serverFiles = [join(ROOT, 'app'), join(ROOT, 'lib')]
  .flatMap(sourceFiles)
  .filter((file) => /^\s*(['"])use server\1/.test(readFileSync(file, 'utf8').replace(/^﻿/, '').trimStart()));

describe('"use server" files', () => {
  it('are found', () => {
    expect(serverFiles.length).toBeGreaterThan(10);
  });

  it.each(serverFiles.map((file) => [relative(ROOT, file), file]))('%s exports only async functions and types', (_name, file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /^export\s/.test(line))
      .filter(({ line }) => !/^export\s+(async\s+function\b|type\b|interface\b)/.test(line))
      // `export { a, b }` and `export * from` re-export values too: refused as well.
      .map(({ line, number }) => `${number}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
