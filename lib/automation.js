const fs = require('fs').promises;
const path = require('path');
const { renameManagedDirectory } = require('./directoryRename');
const { duplicateBoard } = require('./boardDuplication');
const { listLists, resolveList, resolveListFromEntries, listCards, resolveCardFromRecords, getCardId } = require('./cliBoard');
const { reorderCardFilesInList, reorderCardFilesInListByDueDate, reorderListDirectories } = require('./cardOrdering');
const { isInside } = require('./allowedPaths');
const { pathLooksLikeSignboardBoardRoot } = require('./boardDiscovery');

function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim()
      || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[ .]$/.test(name)) {
    throw new Error('A valid directory name is required.');
  }
  return name;
}

async function ensureBoard(boardRoot) {
  if (!await pathLooksLikeSignboardBoardRoot(boardRoot)) throw new Error('Source must be an existing Signboard board.');
}

async function relocateBoard(boardRoot, { name, parent } = {}) {
  boardRoot = path.resolve(boardRoot);
  await ensureBoard(boardRoot);
  const destinationParent = parent ? path.resolve(parent) : path.dirname(boardRoot);
  if (!(await fs.stat(destinationParent)).isDirectory()) throw new Error('Destination parent must be a directory.');
  const newBoardRoot = path.join(destinationParent, validateName(name || path.basename(boardRoot)));
  if (newBoardRoot !== boardRoot && isInside(await fs.realpath(boardRoot), await fs.realpath(destinationParent))) {
    throw new Error('Destination cannot be inside the source board.');
  }
  await renameManagedDirectory(boardRoot, boardRoot, newBoardRoot);
  return { ok: true, boardRoot, newBoardRoot, changed: newBoardRoot !== boardRoot };
}

async function copyBoard(boardRoot, parent, name) {
  validateName(name);
  await ensureBoard(boardRoot);
  const source = await fs.realpath(boardRoot);
  const destinationParent = await fs.realpath(parent);
  if (isInside(source, destinationParent)) throw new Error('Destination cannot be inside the source board.');
  return duplicateBoard({ sourceBoardRoot: boardRoot, destinationParentPath: parent, boardName: name });
}

function assertCompleteOrder(paths, currentPaths, label) {
  const current = new Set(currentPaths);
  if (!paths.length || new Set(paths).size !== paths.length
      || paths.length !== currentPaths.length || paths.some((entry) => !current.has(entry))) {
    throw new Error(`Provide every ${label} exactly once; the order may be stale or contain duplicates.`);
  }
}

async function orderCards(boardRoot, listRef, cardRefs, byDue = false) {
  const list = await resolveList(boardRoot, listRef, { withCardCounts: false });
  if (byDue) {
    if (cardRefs.length) throw new Error('Choose either an explicit card order or due-date ordering.');
    return { ok: true, ...(await reorderCardFilesInListByDueDate(list.path)) };
  }
  const currentPaths = (await fs.readdir(list.path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => path.join(list.path, entry.name));
  const inventory = currentPaths.map((filePath) => ({ filePath, fileName: path.basename(filePath), cardId: getCardId(filePath) }));
  const paths = [];
  let records;
  for (const cardRef of cardRefs) {
    const ref = String(cardRef || '').trim().toLowerCase();
    const byFile = inventory.filter((entry) => entry.fileName.toLowerCase() === ref);
    const exact = byFile.length ? byFile : inventory.filter((entry) => entry.cardId.toLowerCase() === ref);
    if (exact.length > 1) throw new Error(`Ambiguous card reference "${cardRef}".`);
    if (exact.length === 1 && ref) paths.push(exact[0].filePath);
    else {
      // Title/partial matching needs content; read this list once for the entire
      // request, never once per supplied reference. Exact IDs/names need no bodies.
      records ||= await listCards(boardRoot, { listRefs: [list.directoryName] });
      paths.push(resolveCardFromRecords(records, cardRef).filePath);
    }
  }
  assertCompleteOrder(paths, currentPaths, 'card in the list');
  const cards = await reorderCardFilesInList(list.path, paths);
  return { ok: true, cards, changed: cards.some((entry) => entry.sourcePath !== entry.cardPath) };
}

async function orderLists(boardRoot, listRefs) {
  const lists = await listLists(boardRoot, { withCardCounts: false });
  const paths = listRefs.map((ref) => resolveListFromEntries(lists, ref).path);
  assertCompleteOrder(paths, lists.map((entry) => entry.path), 'active list');
  const reordered = await reorderListDirectories(boardRoot, paths);
  return { ok: true, lists: reordered, changed: reordered.some((entry) => entry.sourcePath !== entry.listPath) };
}

const SETTINGS_FIELDS = ['labels', 'themeOverrides', 'workflow', 'externalPublishedCalendar'];
function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) {
    throw new Error('Provide a non-empty board settings JSON object.');
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTINGS_FIELDS.includes(key)) throw new Error(`Unsupported board setting: ${key}`);
    const valid = key === 'labels'
      ? Array.isArray(value) && value.every((label) => label && typeof label === 'object' && !Array.isArray(label) && typeof label.name === 'string' && label.name.trim())
      : value && typeof value === 'object' && !Array.isArray(value);
    if (!valid) {
      throw new Error(`Invalid value for board setting: ${key}`);
    }
  }
  return patch;
}

module.exports = { relocateBoard, copyBoard, orderCards, orderLists, validateSettingsPatch };
