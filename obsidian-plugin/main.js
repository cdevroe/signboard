const {
  Modal,
  Notice,
  Plugin,
  TFile,
  TFolder,
} = require('obsidian');

const SIGNBOARD_ICON = 'layout-dashboard';
const FALLBACK_ICON = 'dice';
const helpers = (() => {
  const CARD_ID_PATTERN = /-([A-Za-z0-9]{5})\.md$/;
  const LIST_NAME_PATTERN = /^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/;
  const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
  const DEFAULT_BOARD_LIST_NAMES = Object.freeze([
    '000-To-do-stock',
    '001-Doing-stock',
    '002-Done-stock',
    ARCHIVE_DIRECTORY_NAME,
  ]);
  const DEFAULT_LABELS = Object.freeze([
    Object.freeze({
      id: 'label-1',
      name: 'Label 1',
      colorLight: '#22c55e',
      colorDark: '#16a34a',
    }),
    Object.freeze({
      id: 'label-2',
      name: 'Label 2',
      colorLight: '#3b82f6',
      colorDark: '#2563eb',
    }),
    Object.freeze({
      id: 'label-3',
      name: 'Label 3',
      colorLight: '#ef4444',
      colorDark: '#dc2626',
    }),
  ]);

  function trimString(value) {
    return value == null ? '' : String(value).trim();
  }

  function slashPath(value) {
    return trimString(value).replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  function getBaseName(value) {
    const parts = slashPath(value).replace(/\/+$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  function slugify(value, fallback = 'card') {
    const slug = trimString(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return slug || fallback;
  }

  function randomId(existingIds = new Set()) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const seen = existingIds instanceof Set ? existingIds : new Set(existingIds || []);

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const value = [...Array(5)]
        .map(() => alphabet.charAt(Math.floor(Math.random() * alphabet.length)))
        .join('');
      if (!seen.has(value)) {
        seen.add(value);
        return value;
      }
    }

    const fallback = Date.now().toString(36).slice(-5).padStart(5, '0');
    seen.add(fallback);
    return fallback;
  }

  function getCardFileId(filePath) {
    const match = getBaseName(filePath).match(CARD_ID_PATTERN);
    return match ? match[1] : '';
  }

  function buildSignboardCardUri(cardId) {
    const normalizedId = trimString(cardId);
    return normalizedId ? `signboard://open-card?id=${encodeURIComponent(normalizedId)}` : '';
  }

  function buildSignboardBoardUri(boardPath) {
    const normalizedPath = trimString(boardPath);
    return normalizedPath ? `signboard://open-board?path=${encodeURIComponent(normalizedPath)}` : '';
  }

  function extractSignboardCardId(value) {
    const input = trimString(value);
    if (!input) {
      return '';
    }

    try {
      const parsedUrl = new URL(input);
      if (parsedUrl.protocol === 'signboard:' && (parsedUrl.hostname || '').toLowerCase() === 'open-card') {
        return trimString(parsedUrl.searchParams.get('id'));
      }
    } catch {
      // Fall back to loose ID extraction.
    }

    const looseMatch = input.match(/[?&]id=([A-Za-z0-9]{5,64})\b/) || input.match(/\b([A-Za-z0-9]{5,64})\b/);
    return looseMatch ? looseMatch[1] : '';
  }

  function getListDisplayName(listDirectoryName) {
    const normalized = trimString(listDirectoryName);
    if (!normalized) {
      return 'Untitled';
    }

    if (normalized === ARCHIVE_DIRECTORY_NAME) {
      return 'Archive';
    }

    const match = normalized.match(LIST_NAME_PATTERN);
    if (match) {
      return trimString(match[2]) || 'Untitled';
    }

    return normalized.replace(/^\d+-/, '') || 'Untitled';
  }

  function cleanCardTitleFromFileName(filePath) {
    const basename = getBaseName(filePath).replace(/\.md$/i, '');
    return basename
      .replace(/^\d{3}-/, '')
      .replace(/-[A-Za-z0-9]{5}$/, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled';
  }

  function buildCardFileName(index, title, existingIds = new Set()) {
    const order = String(Math.max(0, Number(index) || 0)).padStart(3, '0');
    const id = randomId(existingIds);
    return `${order}-${slugify(title)}-${id}.md`;
  }

  function buildBoardSettingsMarkdown() {
    const labelLines = DEFAULT_LABELS.flatMap((label) => ([
      `  - id: ${label.id}`,
      `    name: ${label.name}`,
      `    colorLight: ${label.colorLight}`,
      `    colorDark: ${label.colorDark}`,
    ]));

    return [
      '---',
      'labels:',
      ...labelLines,
      '---',
      '',
    ].join('\n');
  }

  function normalizeStringList(value) {
    const values = Array.isArray(value)
      ? value
      : (trimString(value) ? [value] : []);
    const seen = new Set();
    const normalized = [];

    for (const item of values) {
      const nextItem = trimString(item);
      if (!nextItem || seen.has(nextItem)) {
        continue;
      }
      seen.add(nextItem);
      normalized.push(nextItem);
    }

    return normalized;
  }

  function stripMarkdownExtension(value) {
    return trimString(value).replace(/\.md$/i, '');
  }

  function parseObsidianWikilinkTarget(value) {
    const raw = trimString(value);
    const match = raw.match(/^!?\[\[([^\]]+)\]\]$/);
    if (!match) {
      return '';
    }

    const inner = trimString(match[1]);
    const pipeIndex = inner.indexOf('|');
    const targetWithAnchor = trimString(pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner);
    return stripMarkdownExtension(targetWithAnchor.split('#')[0].replace(/\\/g, '/').replace(/^\/+/, ''));
  }

  function getDeletedObsidianNoteMatchContext({ vaultPath, absolutePath, basename } = {}) {
    const normalizedVaultPath = slashPath(vaultPath).replace(/^\/+/, '');
    const normalizedAbsolutePath = slashPath(absolutePath);
    const fileBaseName = stripMarkdownExtension(basename || getBaseName(normalizedVaultPath || normalizedAbsolutePath));
    const targets = new Set();

    if (normalizedVaultPath) {
      targets.add(stripMarkdownExtension(normalizedVaultPath));
    }
    if (fileBaseName) {
      targets.add(fileBaseName);
    }

    return {
      absolutePath: normalizedAbsolutePath,
      basename: fileBaseName,
      targets,
    };
  }

  function obsidianTargetMatchesDeletedNote(target, context = {}) {
    const normalizedTarget = stripMarkdownExtension(trimString(target).replace(/\\/g, '/').replace(/^\/+/, ''));
    if (!normalizedTarget) {
      return false;
    }

    const targetBaseName = stripMarkdownExtension(getBaseName(normalizedTarget));
    const targets = context.targets instanceof Set ? context.targets : new Set(context.targets || []);
    return targets.has(normalizedTarget) || (targetBaseName && targets.has(targetBaseName));
  }

  function linkedObjectMatchesDeletedObsidianNote(linkedObject = {}, context = {}) {
    if (!linkedObject || typeof linkedObject !== 'object' || Array.isArray(linkedObject)) {
      return false;
    }
    if (trimString(linkedObject.type) !== 'obsidian-note') {
      return false;
    }

    const absolutePath = slashPath(context.absolutePath);
    const linkedPath = slashPath(linkedObject.path);
    if (absolutePath && linkedPath && linkedPath === absolutePath) {
      return true;
    }

    const target = parseObsidianWikilinkTarget(linkedObject.target || linkedObject.raw);
    return obsidianTargetMatchesDeletedNote(target, context);
  }

  function removeDeletedObsidianNoteLinksFromFrontmatter(frontmatter, deletedNoteContext) {
    const target = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const context = deletedNoteContext && deletedNoteContext.targets
      ? deletedNoteContext
      : getDeletedObsidianNoteMatchContext(deletedNoteContext);
    let removedLinkedObjects = 0;
    let removedRelated = 0;

    if (Array.isArray(target.linked_objects)) {
      const nextLinkedObjects = target.linked_objects.filter((linkedObject) => {
        const shouldRemove = linkedObjectMatchesDeletedObsidianNote(linkedObject, context);
        if (shouldRemove) {
          removedLinkedObjects += 1;
        }
        return !shouldRemove;
      });

      if (nextLinkedObjects.length > 0) {
        target.linked_objects = nextLinkedObjects;
      } else {
        delete target.linked_objects;
      }
    }

    const related = normalizeStringList(target.related);
    if (related.length > 0) {
      const nextRelated = related.filter((relatedLink) => {
        const targetValue = parseObsidianWikilinkTarget(relatedLink);
        const shouldRemove = targetValue && obsidianTargetMatchesDeletedNote(targetValue, context);
        if (shouldRemove) {
          removedRelated += 1;
        }
        return !shouldRemove;
      });

      if (nextRelated.length > 0) {
        target.related = nextRelated;
      } else {
        delete target.related;
      }
    }

    return {
      changed: removedLinkedObjects > 0 || removedRelated > 0,
      removedLinkedObjects,
      removedRelated,
    };
  }

  function createObsidianNoteLinkedObject({ title, target, path } = {}) {
    const normalizedTarget = trimString(target);
    const normalizedPath = trimString(path);
    return {
      type: 'obsidian-note',
      title: trimString(title) || 'Obsidian note',
      target: normalizedTarget,
      ...(normalizedPath ? { path: normalizedPath } : {}),
    };
  }

  function getLinkedObjectKey(linkedObject = {}) {
    const type = trimString(linkedObject.type);
    if (type === 'obsidian-note') {
      return `${type}:${trimString(linkedObject.path) || trimString(linkedObject.target)}`;
    }
    if (type === 'file' || type === 'folder') {
      return `${type}:${trimString(linkedObject.path)}`;
    }
    if (type === 'url' || type === 'app-link' || type === 'signboard-link') {
      return `${type}:${trimString(linkedObject.url || linkedObject.target)}`;
    }
    return `${type}:${trimString(linkedObject.target || linkedObject.url || linkedObject.path || linkedObject.title)}`;
  }

  function addLinkedObjectToFrontmatter(frontmatter, linkedObject, relatedLink = '') {
    const target = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const existingObjects = Array.isArray(target.linked_objects)
      ? target.linked_objects.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];
    const linkedObjectKey = getLinkedObjectKey(linkedObject);
    const filteredObjects = linkedObjectKey
      ? existingObjects.filter((item) => getLinkedObjectKey(item) !== linkedObjectKey)
      : existingObjects;

    if (linkedObjectKey) {
      filteredObjects.push(linkedObject);
      target.linked_objects = filteredObjects;
    }

    const normalizedRelated = normalizeStringList(target.related);
    const normalizedRelatedLink = trimString(relatedLink);
    if (normalizedRelatedLink && !normalizedRelated.includes(normalizedRelatedLink)) {
      normalizedRelated.push(normalizedRelatedLink);
    }

    if (normalizedRelated.length > 0) {
      target.related = normalizedRelated;
    }

    return target;
  }

  return {
    ARCHIVE_DIRECTORY_NAME,
    DEFAULT_BOARD_LIST_NAMES,
    buildBoardSettingsMarkdown,
    buildCardFileName,
    buildSignboardBoardUri,
    buildSignboardCardUri,
    cleanCardTitleFromFileName,
    createObsidianNoteLinkedObject,
    extractSignboardCardId,
    getCardFileId,
    getDeletedObsidianNoteMatchContext,
    getListDisplayName,
    linkedObjectMatchesDeletedObsidianNote,
    normalizeStringList,
    obsidianTargetMatchesDeletedNote,
    parseObsidianWikilinkTarget,
    randomId,
    removeDeletedObsidianNoteLinksFromFrontmatter,
    slashPath,
    slugify,
    addLinkedObjectToFrontmatter,
  };
})();

class SignboardConfirmModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.title = options.title || 'Continue?';
    this.message = options.message || '';
    this.confirmText = options.confirmText || 'Continue';
    this.cancelText = options.cancelText || 'Cancel';
    this.resolve = null;
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen() {
    this.setTitle(this.title);
    this.contentEl.textContent = '';

    const message = document.createElement('p');
    message.textContent = this.message;
    this.contentEl.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'signboard-companion-modal-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = this.cancelText;
    cancelButton.addEventListener('click', () => {
      this.resolve(false);
      this.close();
    });

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'mod-cta';
    confirmButton.textContent = this.confirmText;
    confirmButton.addEventListener('click', () => {
      this.resolve(true);
      this.close();
    });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    this.contentEl.appendChild(actions);
    confirmButton.focus();
  }

  onClose() {
    if (this.resolve) {
      this.resolve(false);
      this.resolve = null;
    }
  }
}

class SignboardInputModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.title = options.title || 'Signboard';
    this.label = options.label || 'Value';
    this.placeholder = options.placeholder || '';
    this.submitText = options.submitText || 'Continue';
    this.resolve = null;
    this.input = null;
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen() {
    this.setTitle(this.title);
    this.contentEl.textContent = '';

    const label = document.createElement('label');
    label.textContent = this.label;
    label.className = 'signboard-companion-input-label';
    this.contentEl.appendChild(label);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = this.placeholder;
    this.input.className = 'signboard-companion-input';
    label.appendChild(this.input);

    const actions = document.createElement('div');
    actions.className = 'signboard-companion-modal-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      this.resolve('');
      this.close();
    });

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.className = 'mod-cta';
    submitButton.textContent = this.submitText;
    submitButton.addEventListener('click', () => {
      this.resolve(String(this.input.value || '').trim());
      this.close();
    });

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitButton.click();
      }
    });

    actions.appendChild(cancelButton);
    actions.appendChild(submitButton);
    this.contentEl.appendChild(actions);
    this.input.focus();
  }

  onClose() {
    if (this.resolve) {
      this.resolve('');
      this.resolve = null;
    }
  }
}

module.exports = class SignboardCompanionPlugin extends Plugin {
  async onload() {
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.classList.add('signboard-companion-status');

    this.safeAddRibbonIcon(SIGNBOARD_ICON, 'Open in Signboard', () => {
      this.openActiveFileInSignboard().catch((error) => {
        console.error('Unable to open active file in Signboard.', error);
        new Notice('Unable to open in Signboard.');
      });
    });

    this.addCommand({
      id: 'open-active-file-in-signboard',
      name: 'Open active note or card in Signboard',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const uri = file ? this.getSignboardUriForFile(file) : '';
        if (!uri) {
          return false;
        }
        if (!checking) {
          this.openSignboardUri(uri);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'copy-active-file-signboard-link',
      name: 'Copy Signboard link for active note or card',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const uri = file ? this.getSignboardUriForFile(file) : '';
        if (!uri) {
          return false;
        }
        if (!checking) {
          navigator.clipboard.writeText(uri).then(() => {
            new Notice('Copied Signboard link.');
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: 'open-current-board-in-signboard',
      name: 'Open current Signboard board',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const boardFolder = file ? this.findBoardFolderForFile(file) : null;
        if (!boardFolder) {
          return false;
        }
        if (!checking) {
          this.openBoardFolderInSignboard(boardFolder);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'attach-active-note-to-signboard-card',
      name: 'Attach active note to a Signboard card...',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
          return false;
        }
        if (!checking) {
          this.attachActiveNoteToSignboardCard().catch((error) => {
            console.error('Unable to attach note to Signboard card.', error);
            new Notice('Unable to attach note.');
          });
        }
        return true;
      },
    });

    this.registerEvent(this.app.workspace.on('file-open', () => this.updateStatusBar()));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.updateStatusBar()));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      this.addFileMenuItems(menu, file);
    }));
    if (this.app.vault && typeof this.app.vault.on === 'function') {
      this.registerEvent(this.app.vault.on('delete', (file) => {
        this.handleDeletedObsidianNote(file).catch((error) => {
          console.error('Unable to handle deleted linked Obsidian note.', error);
        });
      }));
    }

    if (typeof this.registerObsidianProtocolHandler === 'function') {
      this.registerObsidianProtocolHandler('signboard', (params) => {
        this.handleObsidianSignboardProtocol(params).catch((error) => {
          console.error('Unable to handle Obsidian Signboard protocol.', error);
          new Notice('Unable to open Signboard item.');
        });
      });
    }

    this.updateStatusBar();
  }

  onunload() {
    if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }

  safeAddRibbonIcon(icon, title, callback) {
    try {
      return this.addRibbonIcon(icon, title, callback);
    } catch (error) {
      console.warn(`Unable to register "${icon}" ribbon icon.`, error);
    }

    try {
      return this.addRibbonIcon(FALLBACK_ICON, title, callback);
    } catch (error) {
      console.warn(`Unable to register "${FALLBACK_ICON}" ribbon icon.`, error);
      return null;
    }
  }

  setMenuItemIcon(item, icon) {
    if (!item || typeof item.setIcon !== 'function') {
      return item;
    }

    try {
      item.setIcon(icon);
    } catch (error) {
      console.warn(`Unable to set "${icon}" menu icon.`, error);
    }

    return item;
  }

  getFileFrontmatter(file) {
    if (!(file instanceof TFile)) {
      return {};
    }

    const cache = this.app.metadataCache.getFileCache(file);
    return cache && cache.frontmatter && typeof cache.frontmatter === 'object'
      ? cache.frontmatter
      : {};
  }

  getSignboardUriForFile(file) {
    if (!(file instanceof TFile)) {
      return '';
    }

    const frontmatter = this.getFileFrontmatter(file);
    const explicitUri = String(frontmatter.signboard_uri || '').trim();
    if (explicitUri.startsWith('signboard://')) {
      return explicitUri;
    }

    const cardId = String(frontmatter.signboard_id || frontmatter.signboard_card_id || '').trim()
      || helpers.getCardFileId(file.path);
    return helpers.buildSignboardCardUri(cardId);
  }

  openSignboardUri(uri) {
    const normalizedUri = String(uri || '').trim();
    if (!normalizedUri) {
      return;
    }
    window.open(normalizedUri);
  }

  async openActiveFileInSignboard() {
    const file = this.app.workspace.getActiveFile();
    const uri = file ? this.getSignboardUriForFile(file) : '';
    if (!uri) {
      new Notice('This note does not have a Signboard link.');
      return;
    }

    this.openSignboardUri(uri);
  }

  updateStatusBar() {
    if (!this.statusBarItem) {
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.statusBarItem.textContent = '';
      return;
    }

    const frontmatter = this.getFileFrontmatter(file);
    if (frontmatter.signboard_id || helpers.getCardFileId(file.path)) {
      this.statusBarItem.textContent = 'Signboard card';
      return;
    }

    if (frontmatter.signboard_card_id || frontmatter.signboard_uri) {
      this.statusBarItem.textContent = 'Linked to Signboard';
      return;
    }

    this.statusBarItem.textContent = '';
  }

  getAbsolutePathForVaultPath(vaultPath) {
    const adapter = this.app.vault.adapter;
    const normalizedPath = helpers.slashPath(vaultPath);

    if (adapter && typeof adapter.getFullPath === 'function') {
      return adapter.getFullPath(normalizedPath);
    }

    if (adapter && typeof adapter.getBasePath === 'function') {
      const basePath = adapter.getBasePath().replace(/[\\/]+$/, '');
      return normalizedPath ? `${basePath}/${normalizedPath}` : basePath;
    }

    return '';
  }

  openBoardFolderInSignboard(folder) {
    if (!(folder instanceof TFolder)) {
      return;
    }

    const absolutePath = this.getAbsolutePathForVaultPath(folder.path);
    const uri = helpers.buildSignboardBoardUri(absolutePath);
    if (!uri) {
      new Notice('Unable to resolve this board folder.');
      return;
    }

    this.openSignboardUri(uri);
  }

  folderLooksLikeSignboardBoard(folder) {
    if (!(folder instanceof TFolder)) {
      return false;
    }

    return folder.children.some((child) => (
      child instanceof TFile &&
      child.name === 'board-settings.md'
    )) || folder.children.some((child) => (
      child instanceof TFolder &&
      (/^\d{3}-.+/.test(child.name) || child.name === helpers.ARCHIVE_DIRECTORY_NAME)
    ));
  }

  findBoardFolderForFile(file) {
    let folder = file instanceof TFolder ? file : file.parent;

    while (folder && folder instanceof TFolder && !folder.isRoot()) {
      if (this.folderLooksLikeSignboardBoard(folder)) {
        return folder;
      }
      folder = folder.parent;
    }

    return null;
  }

  cardHasDeletedObsidianNoteLink(cardFile, deletedNoteContext) {
    if (!(cardFile instanceof TFile) || cardFile.extension !== 'md') {
      return false;
    }

    const frontmatter = this.getFileFrontmatter(cardFile);
    const draftFrontmatter = {
      ...frontmatter,
      related: Array.isArray(frontmatter.related) ? [...frontmatter.related] : frontmatter.related,
      linked_objects: Array.isArray(frontmatter.linked_objects)
        ? frontmatter.linked_objects.map((item) => (
          item && typeof item === 'object' && !Array.isArray(item)
            ? { ...item }
            : item
        ))
        : frontmatter.linked_objects,
    };
    return helpers.removeDeletedObsidianNoteLinksFromFrontmatter(draftFrontmatter, deletedNoteContext).changed;
  }

  findCardsLinkedToDeletedObsidianNote(noteFile) {
    if (!(noteFile instanceof TFile) || noteFile.extension !== 'md') {
      return [];
    }

    const deletedNoteContext = helpers.getDeletedObsidianNoteMatchContext({
      vaultPath: noteFile.path,
      absolutePath: this.getAbsolutePathForVaultPath(noteFile.path),
      basename: noteFile.basename || noteFile.name,
    });

    return this.app.vault
      .getMarkdownFiles()
      .filter((cardFile) => cardFile.path !== noteFile.path)
      .filter((cardFile) => this.cardHasDeletedObsidianNoteLink(cardFile, deletedNoteContext))
      .map((cardFile) => ({ cardFile, deletedNoteContext }));
  }

  async handleDeletedObsidianNote(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return;
    }

    const matches = this.findCardsLinkedToDeletedObsidianNote(file);
    if (matches.length === 0) {
      return;
    }

    const confirmed = await this.confirm({
      title: 'Remove Signboard links?',
      message: [
        `"${file.basename || file.name}" was deleted.`,
        '',
        `Remove its linked object from ${matches.length} Signboard card${matches.length === 1 ? '' : 's'}?`,
      ].join('\n'),
      confirmText: 'Remove Links',
    });
    if (!confirmed) {
      return;
    }

    let updatedCount = 0;
    for (const match of matches) {
      let changed = false;
      await this.app.fileManager.processFrontMatter(match.cardFile, (frontmatter) => {
        const result = helpers.removeDeletedObsidianNoteLinksFromFrontmatter(frontmatter, match.deletedNoteContext);
        changed = result.changed;
      });
      if (changed) {
        updatedCount += 1;
      }
    }

    if (updatedCount > 0) {
      new Notice(`Removed linked note from ${updatedCount} Signboard card${updatedCount === 1 ? '' : 's'}.`);
    }
  }

  addFileMenuItems(menu, file) {
    if (file instanceof TFolder && !file.isRoot()) {
      const isBoard = this.folderLooksLikeSignboardBoard(file);
      menu.addItem((item) => {
        this.setMenuItemIcon(
          item.setTitle(isBoard ? 'Open Board in Signboard' : 'Create Signboard'),
          SIGNBOARD_ICON,
        )
          .onClick(() => {
            if (isBoard) {
              this.openBoardFolderInSignboard(file);
              return;
            }
            this.createSignboardFromFolder(file).catch((error) => {
              console.error('Unable to create Signboard board from folder.', error);
              new Notice('Unable to create Signboard board.');
            });
          });
      });
      return;
    }

    if (!(file instanceof TFile) || file.extension !== 'md') {
      return;
    }

    const uri = this.getSignboardUriForFile(file);
    if (uri) {
      menu.addItem((item) => {
        this.setMenuItemIcon(
          item.setTitle('Open in Signboard'),
          SIGNBOARD_ICON,
        )
          .onClick(() => this.openSignboardUri(uri));
      });
      menu.addItem((item) => {
        this.setMenuItemIcon(
          item.setTitle('Copy Signboard Link'),
          'copy',
        )
          .onClick(() => {
            navigator.clipboard.writeText(uri).then(() => {
              new Notice('Copied Signboard link.');
            });
          });
      });
    }

    menu.addItem((item) => {
      this.setMenuItemIcon(
        item.setTitle('Attach to Signboard Card...'),
        'paperclip',
      )
        .onClick(() => {
          this.attachNoteToSignboardCard(file).catch((error) => {
            console.error('Unable to attach note to Signboard card.', error);
            new Notice('Unable to attach note.');
          });
        });
    });
  }

  async confirm(options) {
    const modal = new SignboardConfirmModal(this.app, options);
    modal.open();
    return modal.promise;
  }

  async prompt(options) {
    const modal = new SignboardInputModal(this.app, options);
    modal.open();
    return modal.promise;
  }

  async ensureFolder(path) {
    const normalizedPath = helpers.slashPath(path).replace(/^\/+|\/+$/g, '');
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFolder) {
      return existing;
    }

    await this.app.vault.createFolder(normalizedPath);
    return this.app.vault.getAbstractFileByPath(normalizedPath);
  }

  async ensureBoardSettings(folder) {
    const settingsPath = helpers.slashPath(`${folder.path}/board-settings.md`);
    if (this.app.vault.getAbstractFileByPath(settingsPath)) {
      return;
    }

    await this.app.vault.create(settingsPath, helpers.buildBoardSettingsMarkdown());
  }

  getDirectMarkdownChildren(folder) {
    return folder.children.filter((child) => (
      child instanceof TFile &&
      child.extension === 'md' &&
      child.name !== 'board-settings.md' &&
      !child.name.endsWith('.base.md')
    ));
  }

  async getUniqueVaultPath(targetFolderPath, fileName) {
    const normalizedFolderPath = helpers.slashPath(targetFolderPath).replace(/\/+$/, '');
    const originalBase = fileName.replace(/\.md$/i, '');
    let candidate = helpers.slashPath(`${normalizedFolderPath}/${fileName}`);
    let suffix = 2;

    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = helpers.slashPath(`${normalizedFolderPath}/${originalBase} ${suffix}.md`);
      suffix += 1;
    }

    return candidate;
  }

  collectExistingSignboardIds(folder) {
    const ids = new Set();
    for (const child of folder.children) {
      if (!(child instanceof TFolder)) {
        continue;
      }
      for (const cardFile of this.getDirectMarkdownChildren(child)) {
        const frontmatter = this.getFileFrontmatter(cardFile);
        const id = String(frontmatter.signboard_id || helpers.getCardFileId(cardFile.path) || '').trim();
        if (id) {
          ids.add(id);
        }
      }
    }
    return ids;
  }

  async processSignboardCardFrontmatter(cardFile, boardFolder, listFolder, existingIds) {
    if (!(cardFile instanceof TFile) || !(boardFolder instanceof TFolder) || !(listFolder instanceof TFolder)) {
      return;
    }

    await this.app.fileManager.processFrontMatter(cardFile, (frontmatter) => {
      const cardId = String(frontmatter.signboard_id || '').trim()
        || helpers.getCardFileId(cardFile.path)
        || helpers.randomId(existingIds);
      const listName = helpers.getListDisplayName(listFolder.name);

      frontmatter.title = String(frontmatter.title || '').trim() || helpers.cleanCardTitleFromFileName(cardFile.path);
      frontmatter.signboard_id = cardId;
      frontmatter.signboard_uri = helpers.buildSignboardCardUri(cardId);
      frontmatter.signboard_board = boardFolder.name;
      frontmatter.signboard_list = listName;
      frontmatter.status = listName;
    });
  }

  async createSignboardFromFolder(folder) {
    if (!(folder instanceof TFolder) || folder.isRoot()) {
      new Notice('Choose a non-root folder to create a Signboard board.');
      return;
    }

    const rootMarkdownFiles = this.getDirectMarkdownChildren(folder);
    const existingListFolders = folder.children.filter((child) => child instanceof TFolder);
    const message = [
      `Create a Signboard board from "${folder.name}"?`,
      '',
      'Signboard will add board metadata and list folders. Existing child folders will become lists. Markdown notes currently at the top level of this folder will be moved into a To-do list so they can become cards. No files will be deleted.',
    ].join('\n');

    const confirmed = await this.confirm({
      title: 'Create Signboard',
      message,
      confirmText: 'Create Signboard',
    });
    if (!confirmed) {
      return;
    }

    const existingIds = this.collectExistingSignboardIds(folder);
    const rootMarkdownCount = rootMarkdownFiles.length;

    if (existingListFolders.length === 0) {
      for (const listName of helpers.DEFAULT_BOARD_LIST_NAMES) {
        await this.ensureFolder(`${folder.path}/${listName}`);
      }
    } else {
      await this.ensureFolder(`${folder.path}/${helpers.ARCHIVE_DIRECTORY_NAME}`);
      if (rootMarkdownCount > 0) {
        await this.ensureFolder(`${folder.path}/000-To-do-stock`);
      }
    }

    await this.ensureBoardSettings(folder);

    if (rootMarkdownCount > 0) {
      const toDoFolderPath = helpers.slashPath(`${folder.path}/000-To-do-stock`);
      for (let index = 0; index < rootMarkdownFiles.length; index += 1) {
        const rootFile = rootMarkdownFiles[index];
        const nextFileName = helpers.buildCardFileName(index, rootFile.basename, existingIds);
        const targetPath = await this.getUniqueVaultPath(toDoFolderPath, nextFileName);
        await this.app.fileManager.renameFile(rootFile, targetPath);
      }
    }

    const refreshedFolder = this.app.vault.getAbstractFileByPath(folder.path);
    const boardFolder = refreshedFolder instanceof TFolder ? refreshedFolder : folder;
    const listFolders = boardFolder.children.filter((child) => (
      child instanceof TFolder &&
      child.name !== helpers.ARCHIVE_DIRECTORY_NAME
    ));

    for (const listFolder of listFolders) {
      for (const cardFile of this.getDirectMarkdownChildren(listFolder)) {
        await this.processSignboardCardFrontmatter(cardFile, boardFolder, listFolder, existingIds);
      }
    }

    new Notice('Created Signboard board.');
    this.openBoardFolderInSignboard(boardFolder);
  }

  async attachActiveNoteToSignboardCard() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Open a note first.');
      return;
    }

    await this.attachNoteToSignboardCard(activeFile);
  }

  async attachNoteToSignboardCard(noteFile) {
    if (!(noteFile instanceof TFile) || noteFile.extension !== 'md') {
      new Notice('Choose a Markdown note to attach.');
      return;
    }

    const rawCardLink = await this.prompt({
      title: 'Attach to Signboard Card',
      label: 'Paste a Signboard card link or card ID',
      placeholder: 'signboard://open-card?id=abc12',
      submitText: 'Attach',
    });
    const cardId = helpers.extractSignboardCardId(rawCardLink);
    if (!cardId) {
      return;
    }

    const cardFile = await this.findCardBySignboardId(cardId);
    if (!cardFile) {
      new Notice('No Signboard card found in this vault for that ID.');
      return;
    }

    if (cardFile.path === noteFile.path) {
      new Notice('This note is already that Signboard card.');
      return;
    }

    const relatedTarget = this.app.metadataCache.fileToLinktext(noteFile, cardFile.path, true);
    const wikilink = `[[${relatedTarget}]]`;
    const linkedObject = helpers.createObsidianNoteLinkedObject({
      title: noteFile.basename,
      target: wikilink,
      path: this.getAbsolutePathForVaultPath(noteFile.path),
    });

    await this.app.fileManager.processFrontMatter(cardFile, (frontmatter) => {
      helpers.addLinkedObjectToFrontmatter(frontmatter, linkedObject, wikilink);
    });

    new Notice('Attached note to Signboard card.');
  }

  async findCardBySignboardId(cardId) {
    const normalizedId = String(cardId || '').trim();
    if (!normalizedId) {
      return null;
    }

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const frontmatter = this.getFileFrontmatter(file);
      const id = String(frontmatter.signboard_id || helpers.getCardFileId(file.path) || '').trim();
      if (id === normalizedId) {
        return file;
      }
    }

    return null;
  }

  async handleObsidianSignboardProtocol(params = {}) {
    const cardId = String(params.cardId || params.id || params.signboard_id || '').trim();
    if (cardId) {
      const cardFile = await this.findCardBySignboardId(cardId);
      if (!cardFile) {
        new Notice('Signboard card not found in this vault.');
        return;
      }
      await this.app.workspace.getLeaf(false).openFile(cardFile, { active: true });
      return;
    }

    const vaultPath = String(params.path || '').trim();
    const file = vaultPath ? this.app.vault.getAbstractFileByPath(helpers.slashPath(vaultPath)) : null;
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file, { active: true });
      return;
    }

    new Notice('Unsupported Signboard request.');
  }
};
