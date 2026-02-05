#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { readCard, writeCard } = require('../lib/cardFrontmatter');

const YAML_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const LEGACY_DELIMITER = '**********';

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    root: null,
    dryRun: false,
    includePlain: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--include-plain') {
      options.includePlain = true;
      continue;
    }

    if (!options.root) {
      options.root = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.root) {
    throw new Error(
      'Usage: node scripts/migrate-legacy-cards.js <board-root> [--dry-run] [--include-plain]'
    );
  }

  return options;
}

async function walkMarkdownFiles(rootDir) {
  const markdownFiles = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        markdownFiles.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  markdownFiles.sort((a, b) => a.localeCompare(b));

  return markdownFiles;
}

function firstNonEmptyLine(text) {
  const lines = text.split(/\r?\n/);
  return lines.find((line) => line.trim().length > 0) || '';
}

function classifyCard(content, includePlain) {
  if (YAML_FRONTMATTER_REGEX.test(content)) {
    return 'yaml';
  }

  if (content.includes(LEGACY_DELIMITER)) {
    return 'legacy-delimiter';
  }

  const firstLine = firstNonEmptyLine(content);
  if (/^#\s+/.test(firstLine)) {
    return 'legacy-heading';
  }

  if (includePlain) {
    return 'plain-markdown';
  }

  return 'skip';
}

async function migrateOne(filePath, dryRun) {
  const raw = await fs.readFile(filePath, 'utf8');
  const card = await readCard(filePath);

  if (dryRun) {
    return card;
  }

  await writeCard(filePath, card);
  return card;
}

async function main() {
  const options = parseArgs(process.argv);
  const rootPath = path.resolve(options.root);

  const stat = await fs.stat(rootPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Board root does not exist or is not a directory: ${rootPath}`);
  }

  const files = await walkMarkdownFiles(rootPath);

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  const byReason = {
    'legacy-delimiter': 0,
    'legacy-heading': 0,
    'plain-markdown': 0,
    yaml: 0,
    skip: 0,
  };

  for (const filePath of files) {
    scanned += 1;

    const raw = await fs.readFile(filePath, 'utf8');
    const reason = classifyCard(raw, options.includePlain);
    byReason[reason] = (byReason[reason] || 0) + 1;

    if (reason === 'yaml' || reason === 'skip') {
      skipped += 1;
      continue;
    }

    await migrateOne(filePath, options.dryRun);
    migrated += 1;

    const relativePath = path.relative(rootPath, filePath);
    const prefix = options.dryRun ? '[dry-run] would migrate' : 'migrated';
    console.log(`${prefix}: ${relativePath}`);
  }

  console.log('');
  console.log(`Root: ${rootPath}`);
  console.log(`Scanned: ${scanned}`);
  console.log(`Migrated: ${migrated}${options.dryRun ? ' (dry-run)' : ''}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`  Already YAML: ${byReason.yaml}`);
  console.log(`  Legacy delimiter: ${byReason['legacy-delimiter']}`);
  console.log(`  Legacy heading: ${byReason['legacy-heading']}`);
  console.log(`  Plain markdown: ${byReason['plain-markdown']}`);
  console.log(`  Skipped plain markdown: ${byReason.skip}`);
}

main().catch((error) => {
  console.error('Migration failed.');
  console.error(error.message || error);
  process.exitCode = 1;
});
