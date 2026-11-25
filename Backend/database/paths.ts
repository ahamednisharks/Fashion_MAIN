import path from 'node:path';
import { pathToFileURL } from 'node:url';

export { projectPath, projectRoot } from '../src/common/utils/project.js';

/** True when the given module is the script Node was started with (CLI entry point). */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && pathToFileURL(path.resolve(entry)).href === moduleUrl;
}
