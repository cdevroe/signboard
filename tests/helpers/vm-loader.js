import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * Load a source file into a VM context.
 * @param {vm.Context} context - The VM context to run the source in.
 * @param {string} relativePath - Path relative to the project root.
 */
export function loadSource(context, relativePath) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  vm.runInContext(source, context);
}
