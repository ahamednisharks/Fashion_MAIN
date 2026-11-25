import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | undefined;

/** Backend project root (folder containing package.json) — works from src/ and dist/. */
export function projectRoot(): string {
  if (cachedRoot) {
    return cachedRoot;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate the Backend project root (package.json).');
    }
    dir = parent;
  }
  cachedRoot = dir;
  return dir;
}

export function projectPath(...segments: string[]): string {
  return path.join(projectRoot(), ...segments);
}

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(projectPath('package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
