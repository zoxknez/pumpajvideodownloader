#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.md',
  '.sql',
  '.ps1',
  '.yml',
  '.yaml',
  '.sh',
  '.css',
  '.scss',
  '.html'
]);

const EXCLUDE_SUFFIXES = new Set(['.d.ts', '.tsbuildinfo']);

const root = process.cwd();

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((file) => !file.includes('node_modules/'))
  .filter((file) => !file.includes('.next/'))
  .filter((file) => !file.includes('dist/'));

const results = [];

for (const file of files) {
  const ext = path.extname(file);
  if (!EXTENSIONS.has(ext)) continue;
  if (Array.from(EXCLUDE_SUFFIXES).some((suffix) => file.endsWith(suffix))) continue;

  try {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = content.split(/\r?\n/).length;
    results.push({ file, lines });
  } catch (error) {
    // ignore unreadable files
  }
}

results.sort((a, b) => b.lines - a.lines);

for (const { file, lines } of results.slice(0, 10)) {
  console.log(String(lines).padStart(6, ' '), file);
}
