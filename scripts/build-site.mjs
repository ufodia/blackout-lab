import { copyFile, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The public project site is deliberately separate from the local browser app.
// Only this exact build output may be replaced; never traverse a linked directory.
const repository = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const output = resolve(repository, 'site-dist');
if (relative(repository, output) !== 'site-dist' || dirname(output) !== repository) {
  throw new Error('Refusing to build outside the expected site-dist directory.');
}

try {
  const existing = await lstat(output);
  if (existing.isSymbolicLink() || !existing.isDirectory() || (await realpath(output)) !== output) {
    throw new Error('Refusing to replace a linked or unexpected site-dist target.');
  }
  await rm(output, { recursive: true });
} catch (error) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
    throw error;
}

const files = [
  ['site/google6beb3f6bb777667e.html', 'google6beb3f6bb777667e.html'],
  ['site/index.html', 'index.html'],
  ['site/style.css', 'style.css'],
  ['site/site.js', 'site.js'],
  ['site/assets/mark.svg', 'assets/mark.svg'],
  ['docs/assets/workspace.png', 'assets/workspace.png'],
];

for (const [sourceName, targetName] of files) {
  const source = join(repository, sourceName);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`Expected a regular project-site source file: ${sourceName}`);
  const target = join(output, targetName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

console.log(`Built Blackout Lab public project site: ${output} (${files.length} files).`);
