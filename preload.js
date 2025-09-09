const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');

contextBridge.exposeInMainWorld('board', {
  listLists: async (root) => {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    let directories = dirs.filter(d => d.isDirectory()).map(d => d.name);
    directories = directories.filter(d => d !== 'XXX-Archive'); // Removes the archive directory from the list
    return directories;
  },

  listCards: async (listPath) => {
    const files = await fs.readdir(listPath, { withFileTypes: true });
    const collator = new Intl.Collator(undefined, {
        usage: 'sort',
        sensitivity:'base',
        numeric: true,
        ignorePunctuation: true,
        localeMatcher: 'lookup'
    });

    let sortedFiles = files.filter(f => f.isFile() && f.name.endsWith('.md')).map(f => f.name);

    sortedFiles.sort((a, b) => collator.compare(a, b));

    return sortedFiles;
  },

  countCards: async (listPath) => { // Reduce code by reusing listCards()?
    const files = await fs.readdir(listPath, { withFileTypes: true });
    return files.filter(f => f.isFile() && f.name.endsWith('.md'))
                .map(f => f.name).length;
  },

  getBoardName: (filePath) => {
    const parts = filePath.split('/').filter(Boolean);
    const lastDir = parts[parts.length - 1];
    return lastDir;
  },

  getCardID: (filePath) => { 
    const cardFileName = filePath.split(/[\\/]/).pop(); 
    return cardFileName.slice(cardFileName.length-8,cardFileName.length-3);
  },

  getCardFileName: (filePath) => { return filePath.split(/[\\/]/).pop(); },

  getListDirectoryName: (filePath) => { return filePath.split(/[\\/]/).pop(); },

  listDirectories: async (root) => {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    let directories = dirs.filter(d => d.isDirectory()).map(d => d.name);
    return directories;
  },

  readCard: async (filePath) => await fs.readFile(filePath, 'utf8'),

  writeCard: async (filePath, content) => await fs.writeFile(filePath, content),

  createCard: async (filePath, content) => await fs.writeFile(filePath, '# ' + content + "\n\n"),

  moveCard: async (src, dst) => await fs.rename(src, dst),

  moveList: async (src, dst) => await fs.rename(src, dst),

  createList: async (listPath) => await fs.mkdir(listPath),

  deleteList: async (listPath) => await fs.rmdir(listPath),

  importFromTrello: async function(filePath) {

    const importedFromTrello = localStorage.getItem('importedFromTrello');

    if ( importedFromTrello ) { // Only import once
      return;
    }

    const jsonPath = filePath + '/trello.json';
    const outRoot = filePath;

    try {
      await fs.access(jsonPath, fs.constants.F_OK);
    } catch {
      return;
    }

    const raw = await fs.readFile(jsonPath, 'utf8');

    const data = await JSON.parse(raw);

    const listMap = {};          // id -> name
    const cardsByList = {};      // listName -> [card, …]

    if (!Array.isArray(data.cards) || !Array.isArray(data.lists)) {
      console.error('Export JSON must contain "cards" and "lists" arrays.');
    }

    for (const list of data.lists) {
      listMap[list.id] = list.name;
    }

    for (const card of data.cards) {
      const listName = listMap[card.idList] || 'UnknownList';
      if (!cardsByList[listName]) cardsByList[listName] = [];
      cardsByList[listName].push(card);
    }

    let listNumber = '0';
    let listCount = 0;

    for (const [listName, cards] of Object.entries(cardsByList)) {

      listNumber = listCount.toString().padStart(3,'0');

      const folder = path.join(outRoot, listNumber + '-' + sanitize(listName) + '-trelo');
      await fs.mkdir(folder, { recursive: true });

      listCount++;

      // Sort cards by their Trello position
      cards.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

      // Write each card as a markdown file
      cards.forEach( async (card, idx) => {
        const number = String(idx + 1).padStart(3, '0');   // 001‑999
        const fileName = `${number}-${await importsanitizeFileName(card.name)}-${await importrand5()}.md`;
        const filePath = path.join(folder, fileName);

        const mdContent = [
          `# ${escapeMarkdown(card.name)}`,
          '',
          card.desc || '',
          // You can add more sections (checklists, comments, etc.) here if needed
        ].join('\n');

        await fs.writeFile(filePath, mdContent, 'utf8');
      });
    }
    await fs.mkdir(filePath + '/XXX-Archive');
    localStorage.setItem('importedFromTrello',true);
  },

  copyExternal: async (src, dstDir) => {
    const dst = path.join(dstDir, path.basename(src));
    await fs.copyFile(src, dst);
    return dst;
  }
});

contextBridge.exposeInMainWorld('chooser', {
  pickDirectory: (opts = {}) => ipcRenderer.invoke('choose-directory', opts),
});

// Remove characters that are not allowed in filenames
function sanitize(str) {
  return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'untitled';
}

async function importsanitizeFileName(rawName) {
  // 1. Split into base name + extension (if any)
  const lastDot = rawName.lastIndexOf('.');
  const ext = (lastDot !== -1) ? rawName.slice(lastDot) : '';
  const base = (lastDot !== -1) ? rawName.slice(0, lastDot) : rawName;

  // 2. Remove unsafe chars
  // Allowed: letters, digits, space, underscore, hyphen, dot (only as separator)
  const allowed = /^[\p{L}\p{N}_\-.\s]+$/u;      // Unicode aware
  const cleanedBase = base
    .replace(/[\\\/:*?"<>|]/g, '')     // common Windows forbidden chars
    .replace(/[^\p{L}\p{N}_\-.\s]/gu, '') // remove everything else
    .trim();                          // strip leading/trailing whitespace

  // 3. Truncate to 100 chars *including* the extension
  const maxTotal = 100;
  const maxBase = Math.max(0, maxTotal - [...ext].length);

  // Use spread [...str] to safely cut by code‑points (not UTF‑16 surrogates)
  const truncatedBase = [...cleanedBase].slice(0, maxBase).join('');

  // 4. Windows forbids names ending in '.' or ' ' – strip those
  const finalBase = truncatedBase.replace(/[ .]+$/g, '');

  // 5. Return combined result
  const finalName = finalBase.slice(0,25) + ext;
  return finalName || '999-untitled.md'; // fallback if everything was stripped
}

async function importrand5() {
  return [...Array(5)]
      .map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 60)))
        .join('');
}

// Escape Markdown special characters in titles (optional)
function escapeMarkdown(text) {
  return text.replace(/([#*_`\[\]])/g, '\\$1');
}