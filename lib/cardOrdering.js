const fs = require('fs').promises;
const path = require('path');

const cardSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function toNumberedPrefix(value) {
  return String(value).padStart(3, '0');
}

function applyCardPrefix(fileName, prefix) {
  const normalized = String(fileName || '').trim();
  const nextPrefix = toNumberedPrefix(prefix);

  if (/^\d+-/.test(normalized)) {
    return normalized.replace(/^\d+/, nextPrefix);
  }

  if (normalized.endsWith('.md')) {
    const baseName = normalized.slice(0, -3).replace(/^-+/, '');
    return `${nextPrefix}-${baseName}.md`;
  }

  return `${nextPrefix}-${normalized}`;
}

async function listCardFiles(listPath) {
  const entries = await fs.readdir(listPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((left, right) => cardSortCollator.compare(left, right));
}

async function insertCardFileAtTop(listPath, sourcePath, sourceFileName) {
  const resolvedListPath = path.resolve(listPath);
  const resolvedSourcePath = path.resolve(sourcePath);
  const existingCardFiles = (await listCardFiles(resolvedListPath))
    .filter((fileName) => path.resolve(path.join(resolvedListPath, fileName)) !== resolvedSourcePath);
  const stagedCards = [];
  const tempToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (let index = 0; index < existingCardFiles.length; index += 1) {
    const originalFileName = existingCardFiles[index];
    const tempFileName = `__sbtmp-${tempToken}-${String(index).padStart(3, '0')}.tmp`;
    await fs.rename(
      path.join(resolvedListPath, originalFileName),
      path.join(resolvedListPath, tempFileName),
    );
    stagedCards.push({ originalFileName, tempFileName });
  }

  const insertedFileName = applyCardPrefix(sourceFileName, 0);
  await fs.rename(resolvedSourcePath, path.join(resolvedListPath, insertedFileName));

  for (let index = 0; index < stagedCards.length; index += 1) {
    const stagedCard = stagedCards[index];
    await fs.rename(
      path.join(resolvedListPath, stagedCard.tempFileName),
      path.join(resolvedListPath, applyCardPrefix(stagedCard.originalFileName, index + 1)),
    );
  }

  return insertedFileName;
}

module.exports = {
  insertCardFileAtTop,
};
