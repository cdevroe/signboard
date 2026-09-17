const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { atomicWriteFile } = require('./atomicFile');
const cardFrontmatter = require('./cardFrontmatter');
const { normalizeSignboardCardFrontmatter } = require('./obsidianIntegration');
const { mapFileReads } = require('./fileReadQueue');

async function collectCards(directory, recursive = false) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      // Metadata reconciliation must not replace links or edit their targets.
      throw new Error(`Cannot reconcile a directory containing symbolic links: ${target}`);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) result.push(target);
    else if (recursive && entry.isDirectory()) result.push(...await collectCards(target, true));
  }
  return result;
}

async function renameManagedDirectory(boardRoot, sourcePath, destinationPath) {
  boardRoot = path.resolve(boardRoot);
  sourcePath = path.resolve(sourcePath);
  destinationPath = path.resolve(destinationPath);
  if (sourcePath === destinationPath) return;
  const movingBoard = boardRoot === sourcePath;
  if (!movingBoard && (path.dirname(sourcePath) !== boardRoot || path.dirname(destinationPath) !== boardRoot)) {
    throw new Error('A renamed list must remain directly inside its board.');
  }
  if ((await fs.lstat(sourcePath)).isSymbolicLink()) throw new Error('Cannot rename a linked directory.');
  try {
    await fs.lstat(destinationPath);
    throw new Error(`Destination already exists: ${destinationPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let files = [];
  if (movingBoard) {
    for (const entry of await fs.readdir(boardRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && (/^\d+-/.test(entry.name) || entry.name === 'XXX-Archive')) {
        files.push(...await collectCards(path.join(boardRoot, entry.name), true));
      }
    }
  } else files = await collectCards(sourcePath, true);
  const destinationBoard = movingBoard ? destinationPath : boardRoot;
  const plans = await mapFileReads(files, async (file) => {
    const original = await fs.readFile(file, 'utf8');
    const card = cardFrontmatter.parseCardContent(original);
    const target = path.join(destinationPath, path.relative(sourcePath, file));
    const frontmatter = normalizeSignboardCardFrontmatter({ boardRoot: destinationBoard, cardPath: target, frontmatter: card.frontmatter });
    const next = cardFrontmatter.serializeCard(frontmatter, card.body, target);
    return { file, target, original, next };
  });
  if (!movingBoard) {
    // Edit only the explicit workflow references; preserve other settings/body.
    for (const name of ['board-settings.md', 'labels.md']) {
      const file = path.join(boardRoot, name);
      const original = await fs.readFile(file, 'utf8').catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (original == null) continue;
      const match = original.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!match) break;
      const settings = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
      let changed = false;
      for (const field of ['completedListNames', 'completedLists', 'ignoredCompletedListNames']) {
        if (!Array.isArray(settings?.workflow?.[field])) continue;
        settings.workflow[field] = settings.workflow[field].map((name) => {
          if (String(name).trim().toLowerCase() !== path.basename(sourcePath).toLowerCase()) return name;
          changed = true;
          return path.basename(destinationPath);
        });
      }
      if (changed) plans.push({ file, target: file, original,
        next: `---\n${yaml.dump(settings, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true })}---\n${original.slice(match[0].length)}` });
      break;
    }
  }
  await fs.rename(sourcePath, destinationPath);
  const written = [];
  try {
    for (const plan of plans) {
      if (plan.original === plan.next) continue;
      if (await fs.readFile(plan.target, 'utf8') !== plan.original) {
        throw new Error(`File changed during rename: ${plan.target}`);
      }
      await atomicWriteFile(plan.target, plan.next, 'utf8');
      written.push(plan);
    }
  } catch (error) {
    const failures = [];
    for (const plan of written.reverse()) {
      try {
        if (await fs.readFile(plan.target, 'utf8') !== plan.next) throw new Error(`File changed during recovery: ${plan.target}`);
        await atomicWriteFile(plan.target, plan.original, 'utf8');
      } catch (rollbackError) { failures.push(rollbackError); }
    }
    if (!failures.length) {
      try { await fs.rename(destinationPath, sourcePath); } catch (rollbackError) { failures.push(rollbackError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], `Rename recovery incomplete; inspect ${destinationPath}.`);
    throw error;
  }
}

module.exports = { renameManagedDirectory };
