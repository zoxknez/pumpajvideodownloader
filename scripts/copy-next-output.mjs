import { access, cp, rm } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const webDir = resolve(repoRoot, 'web');
const sourceDir = resolve(webDir, '.next');
const targetDir = resolve(repoRoot, '.next');

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(sourceDir))) {
    console.warn(`Skipping copy: missing source directory ${sourceDir}`);
    return;
  }

  if (await pathExists(targetDir)) {
    await rm(targetDir, { recursive: true, force: true });
  }

  await cp(sourceDir, targetDir, { recursive: true });
  console.log(`Copied Next.js build output from ${sourceDir} to ${targetDir}`);
}

main().catch((error) => {
  console.error('Failed to synchronize Next.js build output:', error);
  process.exitCode = 1;
});
