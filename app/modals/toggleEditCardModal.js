function getEditorFrontmatter() {
    const state = document.getElementById('cardEditorCardMetadata').value;

    try {
        const parsed = JSON.parse(state || '{}');
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch {
        return {};
    }
}

function setEditorFrontmatter(frontmatter) {
    document.getElementById('cardEditorCardMetadata').value = JSON.stringify(frontmatter || {});
}

const TIMESTAMP_TOOLBAR_ICON = `
<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
  <circle cx="9" cy="9" r="7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></circle>
  <path d="M9 4.5v4.5l3 2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
</svg>`;

function addTimestampToolbarButton(editor) {
    if (!editor || !editor.container) {
        return;
    }

    const toolbar = editor.container.querySelector('.overtype-toolbar');
    if (!toolbar) {
        return;
    }

    if (toolbar.querySelector('[data-action="insert-timestamp-list-item"]')) {
        return;
    }

    const button = document.createElement('button');
    button.className = 'overtype-toolbar-button';
    button.type = 'button';
    button.title = 'Add timestamped list item';
    button.setAttribute('aria-label', 'Add timestamped list item');
    button.setAttribute('data-action', 'insert-timestamp-list-item');
    button.innerHTML = TIMESTAMP_TOOLBAR_ICON;
    button.addEventListener('click', (event) => {
        event.preventDefault();
        insertTimestampListItem(editor.textarea);
    });

    const viewModeButton = toolbar.querySelector('[data-action="toggle-view-menu"]');
    if (viewModeButton && viewModeButton.parentNode === toolbar) {
        toolbar.insertBefore(button, viewModeButton);
        return;
    }

    toolbar.appendChild(button);
}

function removeViewModeToolbarButton(editor) {
    if (!editor || !editor.container) {
        return;
    }

    const toolbar = editor.container.querySelector('.overtype-toolbar');
    if (!toolbar) {
        return;
    }

    const viewModeButton = toolbar.querySelector('[data-action="toggle-view-menu"]');
    if (!viewModeButton) {
        return;
    }

    const separatorBefore = viewModeButton.previousElementSibling;
    if (separatorBefore && separatorBefore.classList.contains('overtype-toolbar-separator')) {
        separatorBefore.remove();
    }

    viewModeButton.remove();
}

function setEditorLabelDisplay(labelIds) {
    const cardEditorCardLabels = document.getElementById('cardEditorCardLabels');
    if (!cardEditorCardLabels) {
        return;
    }

    cardEditorCardLabels.innerHTML = '';

    const ids = Array.isArray(labelIds) ? labelIds.map((labelId) => String(labelId)) : [];
    if (ids.length === 0) {
        cardEditorCardLabels.classList.remove('card-labels', 'card-editor-labels');
        return;
    }

    cardEditorCardLabels.classList.add('card-labels', 'card-editor-labels');

    for (const labelId of ids) {
        const label = getBoardLabelById(labelId);
        const labelChip = document.createElement('span');
        labelChip.className = 'card-label-chip';

        if (label) {
            const chipColor = getBoardLabelColor(label);
            labelChip.textContent = label.name;
            labelChip.style.backgroundColor = `${chipColor}22`;
            labelChip.style.borderColor = chipColor;
        } else {
            labelChip.classList.add('card-label-chip-unknown');
            labelChip.textContent = 'Unknown label';
            labelChip.title = labelId;
        }

        cardEditorCardLabels.appendChild(labelChip);
    }
}

function renderCardEditorTimestamps(timestamps = {}) {
    const timestampEl = document.getElementById('cardEditorTimestampMetadata');
    if (!timestampEl) {
        return;
    }

    const createdAt = getCardTimestampValue({ timestamps }, 'createdAt');
    const updatedAt = getCardTimestampValue({ timestamps }, 'updatedAt');
    timestampEl.innerHTML = '';
    timestampEl.dataset.createdAt = createdAt;
    timestampEl.dataset.updatedAt = updatedAt;

    const entries = [
        { label: 'Created', value: createdAt },
        { label: 'Updated', value: updatedAt },
    ].filter((entry) => entry.value);

    timestampEl.hidden = entries.length === 0;
    if (entries.length === 0) {
        return;
    }

    for (const entry of entries) {
        const item = document.createElement('span');
        item.className = 'cardEditorTimestampItem';

        const label = document.createElement('span');
        label.className = 'cardEditorTimestampLabel';
        label.textContent = entry.label;
        item.appendChild(label);

        const time = document.createElement('time');
        time.className = 'cardEditorTimestampValue';
        setCardTimestampElement(time, entry.value, formatCardTimestampDate);
        item.appendChild(time);

        timestampEl.appendChild(item);
    }
}

function updateCardEditorUpdatedTimestamp(updatedAt = new Date().toISOString()) {
    const timestampEl = document.getElementById('cardEditorTimestampMetadata');
    if (!timestampEl) {
        return;
    }

    renderCardEditorTimestamps({
        createdAt: timestampEl.dataset.createdAt || '',
        updatedAt,
    });
}

let pendingEditorBody = '';
let pendingEditorSaveTimer = null;
let editorSaveInFlight = Promise.resolve();
let cardEditorListMoveFeedbackTimer = null;
let activeCardEditorInstance = null;
let activeEditorDiskState = null;
let editorSaveOperationInFlight = false;
let isApplyingExternalEditorRefresh = false;
let cardEditorDropDepth = 0;

function getActiveEditorCardPath() {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    return cardEditorCardPath ? String(cardEditorCardPath.value || '').trim() : '';
}

function isCardEditorActive() {
    const modalEditCard = document.getElementById('modalEditCard');
    if (
        !modalEditCard ||
        modalEditCard.classList.contains('hidden') ||
        modalEditCard.getAttribute('aria-hidden') === 'true' ||
        modalEditCard.style.display === 'none'
    ) {
        return false;
    }

    return getActiveEditorCardPath().length > 0;
}

function clearQueuedEditorSave() {
    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
        pendingEditorSaveTimer = null;
    }

    pendingEditorBody = '';
}

function clearActiveCardEditorState() {
    activeCardEditorInstance = null;
    activeEditorDiskState = null;
    editorSaveOperationInFlight = false;
    isApplyingExternalEditorRefresh = false;
    cardEditorDropDepth = 0;
}

function getEditorBodyValue() {
    if (activeCardEditorInstance && typeof activeCardEditorInstance.getValue === 'function') {
        return String(activeCardEditorInstance.getValue() || '');
    }

    const editorTextarea = document.querySelector('#cardEditorOverType .overtype-input');
    return editorTextarea ? String(editorTextarea.value || '') : '';
}

function getEditorTitleValue() {
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    return cardEditorTitle ? String(cardEditorTitle.textContent || '').trim() : '';
}

function createEditorDiskState(cardPath, card) {
    const frontmatter = card && card.frontmatter && typeof card.frontmatter === 'object'
        ? card.frontmatter
        : {};

    return {
        cardPath: String(cardPath || ''),
        frontmatterJson: JSON.stringify(frontmatter),
        title: String(frontmatter.title || '').trim(),
        body: String(card && typeof card.body === 'string' ? card.body : ''),
    };
}

function setActiveEditorDiskState(cardPath, card) {
    activeEditorDiskState = createEditorDiskState(cardPath, card);
}

function isActiveEditorUnchangedFromDisk() {
    if (
        !isCardEditorActive() ||
        !activeEditorDiskState ||
        pendingEditorSaveTimer ||
        editorSaveOperationInFlight
    ) {
        return false;
    }

    const cardPath = getActiveEditorCardPath();
    if (!cardPath || cardPath !== activeEditorDiskState.cardPath) {
        return false;
    }

    return getEditorBodyValue() === activeEditorDiskState.body
        && getEditorTitleValue() === activeEditorDiskState.title
        && JSON.stringify(getEditorFrontmatter()) === activeEditorDiskState.frontmatterJson;
}

function normalizeRelatedNoteValues(value) {
    if (Array.isArray(value)) {
        return value
            .filter((item) => typeof item === 'string')
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    const normalized = String(value || '').trim();
    return normalized ? [normalized] : [];
}

function parseObsidianRelatedNoteLink(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^!?\[\[([^\]]+)\]\]$/);
    if (!match) {
        return null;
    }

    const inner = String(match[1] || '').trim();
    const pipeIndex = inner.indexOf('|');
    const targetWithAnchor = (pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner).trim();
    const alias = (pipeIndex >= 0 ? inner.slice(pipeIndex + 1) : '').trim();
    const target = targetWithAnchor.split('#')[0].replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!target) {
        return null;
    }

    const segments = target.split('/').filter(Boolean);
    const targetName = (segments[segments.length - 1] || target).replace(/\.md$/i, '');
    return {
        raw,
        target,
        label: alias || targetName || target,
    };
}

function createLinkedObsidianNoteObjectFromRelatedValue(value) {
    const parsed = parseObsidianRelatedNoteLink(value);
    if (!parsed) {
        return null;
    }

    return {
        type: 'obsidian-note',
        title: parsed.label,
        target: parsed.raw,
        raw: parsed.raw,
        relatedTarget: parsed.target,
    };
}

function getParsedObsidianTarget(value) {
    const parsed = parseObsidianRelatedNoteLink(value);
    return parsed ? parsed.target : '';
}

function getCardEditorLinkedObjects() {
    return normalizeCardEditorLinkedObjects(getEditorFrontmatter());
}

function getLinkedObjectKey(linkedObject = {}) {
    const type = String(linkedObject.type || '').trim();
    if (!type) {
        return '';
    }

    if (type === 'file' || type === 'folder') {
        return `${type}:${String(linkedObject.path || '').trim()}`;
    }

    if (type === 'url') {
        return `url:${String(linkedObject.url || '').trim()}`;
    }

    if (type === 'app-link' || type === 'signboard-link') {
        return `${type}:${String(linkedObject.url || linkedObject.target || '').trim()}`;
    }

    if (type === 'obsidian-note') {
        return `obsidian-note:${String(linkedObject.path || linkedObject.target || linkedObject.raw || '').trim()}`;
    }

    return `${type}:${String(linkedObject.target || linkedObject.url || linkedObject.path || linkedObject.title || '').trim()}`;
}

function normalizeStructuredLinkedObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const type = String(value.type || '').trim();
    if (!type) {
        return null;
    }

    const title = String(value.title || value.label || '').trim();
    if (type === 'file' || type === 'folder') {
        const targetPath = String(value.path || '').trim();
        return targetPath
            ? { type, title: title || targetPath.split(/[\\/]/).filter(Boolean).pop() || targetPath, path: targetPath }
            : null;
    }

    if (type === 'url') {
        const url = String(value.url || '').trim();
        return url
            ? {
                type,
                title: title || url,
                url,
                faviconPath: String(value.faviconPath || '').trim(),
              }
            : null;
    }

    if (type === 'app-link' || type === 'signboard-link') {
        const url = String(value.url || value.target || '').trim();
        return url
            ? { type, title: title || (type === 'signboard-link' ? 'Signboard link' : url), url }
            : null;
    }

    if (type === 'obsidian-note') {
        const target = String(value.target || value.raw || '').trim();
        const raw = String(value.raw || target).trim();
        const notePath = String(value.path || '').trim();
        const parsedTarget = parseObsidianRelatedNoteLink(target || raw);
        const fallbackTitle = parsedTarget
            ? parsedTarget.label
            : (notePath ? notePath.split(/[\\/]/).filter(Boolean).pop().replace(/\.md$/i, '') : 'Obsidian note');
        return (target || notePath)
            ? {
                type,
                title: title || fallbackTitle,
                target,
                raw,
                path: notePath,
              }
            : null;
    }

    return null;
}

function normalizeCardEditorLinkedObjects(frontmatter = {}) {
    const linkedObjects = [];
    const seen = new Set();

    const addObject = (linkedObject) => {
        const normalized = normalizeStructuredLinkedObject(linkedObject);
        const key = normalized ? getLinkedObjectKey(normalized) : '';
        if (!key || seen.has(key)) {
            return;
        }
        if (normalized.type === 'obsidian-note' && normalized.target) {
            const targetKey = `obsidian-target:${normalized.target}`;
            if (seen.has(targetKey)) {
                return;
            }
            seen.add(targetKey);
        }
        seen.add(key);
        linkedObjects.push(normalized);
    };

    const structuredObjects = Array.isArray(frontmatter.linked_objects) ? frontmatter.linked_objects : [];
    const normalizedStructuredObjects = structuredObjects
        .map(normalizeStructuredLinkedObject)
        .filter(Boolean);
    const relatedValues = normalizeRelatedNoteValues(frontmatter.related);
    const relatedObsidianNotes = relatedValues
        .map(createLinkedObsidianNoteObjectFromRelatedValue)
        .filter(Boolean);
    const structuredObsidianCount = normalizedStructuredObjects
        .filter((linkedObject) => linkedObject.type === 'obsidian-note')
        .length;
    const usedRelatedObsidianNotes = new Set();
    let structuredObsidianIndex = 0;

    const findRelatedObsidianNoteMatch = (linkedObject, fallbackIndex) => {
        const candidateTarget = String(linkedObject.target || linkedObject.raw || '').trim();
        const parsedCandidateTarget = getParsedObsidianTarget(candidateTarget);
        const exactMatchIndex = relatedObsidianNotes.findIndex((relatedNote, index) => {
            if (usedRelatedObsidianNotes.has(index)) {
                return false;
            }

            return Boolean(
                relatedNote.target === candidateTarget ||
                relatedNote.raw === candidateTarget ||
                (parsedCandidateTarget && relatedNote.relatedTarget === parsedCandidateTarget)
            );
        });

        if (exactMatchIndex >= 0) {
            return exactMatchIndex;
        }

        if (
            structuredObsidianCount === relatedObsidianNotes.length &&
            fallbackIndex >= 0 &&
            fallbackIndex < relatedObsidianNotes.length &&
            !usedRelatedObsidianNotes.has(fallbackIndex)
        ) {
            return fallbackIndex;
        }

        if (
            structuredObsidianCount === 1 &&
            relatedObsidianNotes.length === 1 &&
            !usedRelatedObsidianNotes.has(0)
        ) {
            return 0;
        }

        return -1;
    };

    for (const linkedObject of normalizedStructuredObjects) {
        if (linkedObject.type === 'obsidian-note' && relatedObsidianNotes.length > 0) {
            const relatedMatchIndex = findRelatedObsidianNoteMatch(linkedObject, structuredObsidianIndex);
            structuredObsidianIndex += 1;

            if (relatedMatchIndex >= 0) {
                const relatedNote = relatedObsidianNotes[relatedMatchIndex];
                usedRelatedObsidianNotes.add(relatedMatchIndex);
                addObject({
                    ...linkedObject,
                    title: relatedNote.title,
                    target: relatedNote.target,
                    raw: relatedNote.raw,
                });
                continue;
            }
        }

        addObject(linkedObject);
    }

    for (let index = 0; index < relatedObsidianNotes.length; index += 1) {
        if (!usedRelatedObsidianNotes.has(index)) {
            addObject(relatedObsidianNotes[index]);
        }
    }

    for (const relatedValue of relatedValues) {
        if (parseObsidianRelatedNoteLink(relatedValue)) {
            continue;
        }

        try {
            const parsedUrl = new URL(relatedValue);
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                addObject({
                    type: 'url',
                    title: parsedUrl.hostname,
                    url: parsedUrl.href,
                });
            }
        } catch {
            // Ignore unrelated legacy values.
        }
    }

    return linkedObjects;
}

function updateCardEditorLinkedObjectsControl(linkedObjects = getCardEditorLinkedObjects()) {
    const button = document.getElementById('cardEditorLinkedObjectsLink');
    const countEl = document.getElementById('cardEditorLinkedObjectsCount');
    const count = Array.isArray(linkedObjects) ? linkedObjects.length : 0;

    if (countEl) {
        countEl.textContent = count > 0 ? String(count) : '';
        countEl.hidden = count === 0;
    }

    if (button) {
        button.setAttribute(
            'aria-label',
            count === 1 ? 'Linked objects, 1 object' : `Linked objects, ${count} objects`,
        );
        button.title = count > 0 ? `Linked objects (${count})` : 'Linked objects';
    }
}

function getLinkedObjectLabel(linkedObject = {}) {
    const title = String(linkedObject.title || '').trim();
    if (title) {
        return title;
    }

    if (linkedObject.type === 'file' || linkedObject.type === 'folder') {
        return String(linkedObject.path || '').split(/[\\/]/).filter(Boolean).pop() || 'Linked file';
    }

    if (linkedObject.type === 'url') {
        try {
            return new URL(String(linkedObject.url || '')).hostname;
        } catch {
            return String(linkedObject.url || 'Web link');
        }
    }

    if (linkedObject.type === 'app-link' || linkedObject.type === 'signboard-link') {
        return linkedObject.type === 'signboard-link' ? 'Signboard link' : String(linkedObject.url || 'App link');
    }

    if (linkedObject.type === 'obsidian-note') {
        const target = String(linkedObject.target || '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0];
        return target.split('/').filter(Boolean).pop() || 'Obsidian note';
    }

    return 'Linked object';
}

function getLinkedObjectIconName(linkedObject = {}) {
    if (linkedObject.type === 'folder') return 'folder';
    if (linkedObject.type === 'url') return 'link';
    if (linkedObject.type === 'app-link') return 'external-link';
    if (linkedObject.type === 'signboard-link') return 'columns';
    if (linkedObject.type === 'obsidian-note') return 'file-text';
    return 'paperclip';
}

function filePathToRendererUrl(filePath) {
    const normalized = String(filePath || '').trim();
    if (!normalized) {
        return '';
    }

    const forwardPath = normalized.replace(/\\/g, '/');
    const prefixedPath = forwardPath.startsWith('/') ? forwardPath : `/${forwardPath}`;
    return `file://${encodeURI(prefixedPath)}`;
}

function appendLinkedObjectIcon(parent, linkedObject) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'card-editor-related-note-icon';
    iconWrap.setAttribute('aria-hidden', 'true');

    if (linkedObject.type === 'url' && linkedObject.faviconPath) {
        const image = document.createElement('img');
        image.alt = '';
        image.src = filePathToRendererUrl(linkedObject.faviconPath);
        iconWrap.appendChild(image);
        parent.appendChild(iconWrap);
        return;
    }

    const iconName = getLinkedObjectIconName(linkedObject);
    if (window.feather && window.feather.icons && window.feather.icons[iconName]) {
        iconWrap.innerHTML = window.feather.icons[iconName].toSvg();
    }
    parent.appendChild(iconWrap);
}

async function openCardEditorLinkedObject(linkedObject) {
    const cardPath = getActiveEditorCardPath();
    if (!cardPath || !window.board || typeof window.board.openLinkedObject !== 'function') {
        return;
    }

    try {
        const result = await window.board.openLinkedObject(cardPath, linkedObject);
        if (!result || result.ok === false) {
            const message = result && result.error === 'NOTE_NOT_FOUND'
                ? 'Linked note not found.'
                : 'Unable to open linked object.';
            if (typeof announceSignboardStatus === 'function') {
                announceSignboardStatus(message);
            }
            return;
        }

        const label = getLinkedObjectLabel(linkedObject);
        const message = `Opened ${label || 'linked object'}.`;
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus(message);
        }
    } catch (error) {
        console.error('Unable to open linked object.', error);
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Unable to open linked object.');
        }
    }
}

async function removeCardEditorLinkedObject(linkedObject) {
    const cardPath = getActiveEditorCardPath();
    if (!cardPath || !window.board || typeof window.board.updateFrontmatter !== 'function') {
        return;
    }

    const currentFrontmatter = getEditorFrontmatter();
    const targetKey = getLinkedObjectKey(linkedObject);
    const nextLinkedObjects = (Array.isArray(currentFrontmatter.linked_objects) ? currentFrontmatter.linked_objects : [])
        .map(normalizeStructuredLinkedObject)
        .filter(Boolean)
        .filter((item) => getLinkedObjectKey(item) !== targetKey);
    const nextRelated = normalizeRelatedNoteValues(currentFrontmatter.related).filter((item) => {
        if (linkedObject.type === 'obsidian-note') {
            return item !== linkedObject.target && item !== linkedObject.raw;
        }
        if (linkedObject.type === 'url') {
            return item !== linkedObject.url;
        }
        return true;
    });

    try {
        const normalizedFrontmatter = await window.board.updateFrontmatter(cardPath, {
            linked_objects: nextLinkedObjects.length > 0 ? nextLinkedObjects : undefined,
            related: nextRelated.length > 0 ? nextRelated : undefined,
        });
        setEditorFrontmatter(normalizedFrontmatter);
        await renderActiveEditorMetadata(normalizedFrontmatter);
        setActiveEditorDiskState(cardPath, {
            frontmatter: normalizedFrontmatter,
            body: getEditorBodyValue(),
        });
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Removed linked object.');
        }
    } catch (error) {
        console.error('Unable to remove linked object.', error);
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Unable to remove linked object.');
        }
    }
}

function renderCardEditorRelatedNotes(frontmatter = {}) {
    const relatedEl = document.getElementById('cardEditorRelatedNotes');
    if (!relatedEl) {
        return;
    }

    relatedEl.innerHTML = '';

    const linkedObjects = normalizeCardEditorLinkedObjects(frontmatter);
    updateCardEditorLinkedObjectsControl(linkedObjects);

    if (linkedObjects.length === 0) {
        relatedEl.hidden = true;
        return;
    }

    relatedEl.hidden = false;

    for (const linkedObject of linkedObjects) {
        const labelText = getLinkedObjectLabel(linkedObject);
        const chip = document.createElement('span');
        chip.className = 'card-editor-related-note';

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'card-editor-related-note-open';
        openButton.title = 'Open linked object';
        openButton.setAttribute('aria-label', `Open ${labelText}`);
        appendLinkedObjectIcon(openButton, linkedObject);

        const label = document.createElement('span');
        label.className = 'card-editor-related-note-label';
        label.textContent = labelText;
        openButton.appendChild(label);

        openButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await openCardEditorLinkedObject(linkedObject);
        });

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'card-editor-related-note-remove';
        removeButton.title = 'Remove linked object';
        removeButton.setAttribute('aria-label', `Remove ${labelText}`);
        if (window.feather && window.feather.icons && window.feather.icons.x) {
            removeButton.innerHTML = window.feather.icons.x.toSvg();
        } else {
            removeButton.textContent = 'x';
        }
        removeButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await removeCardEditorLinkedObject(linkedObject);
        });

        chip.appendChild(openButton);
        chip.appendChild(removeButton);
        relatedEl.appendChild(chip);
    }
}

async function renderActiveEditorMetadata(frontmatter = {}, timestamps) {
    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');

    setEditorLabelDisplay(frontmatter.labels);
    renderCardEditorRelatedNotes(frontmatter);
    if (timestamps !== undefined) {
        renderCardEditorTimestamps(timestamps);
    }

    if (!cardEditorCardDueDateDisplay) {
        return;
    }

    const dueValue = String(frontmatter.due || '').trim();
    if (dueValue) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(dueValue);
        setDueDateVisualClass(cardEditorSetDueDateLink, dueValue);
    } else {
        cardEditorCardDueDateDisplay.textContent = '';
        setDueDateVisualClass(cardEditorSetDueDateLink, '');
    }
}

async function refreshActiveCardEditorFromDiskIfClean() {
    if (!isActiveEditorUnchangedFromDisk() || !window.board || typeof window.board.readCard !== 'function') {
        return false;
    }

    const cardPath = getActiveEditorCardPath();
    let card;
    try {
        card = await window.board.readCard(cardPath);
    } catch {
        return false;
    }

    if (!isActiveEditorUnchangedFromDisk() || getActiveEditorCardPath() !== cardPath) {
        return false;
    }

    const nextState = createEditorDiskState(cardPath, card);
    if (
        activeEditorDiskState &&
        nextState.frontmatterJson === activeEditorDiskState.frontmatterJson &&
        nextState.body === activeEditorDiskState.body
    ) {
        return false;
    }

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const editorTextarea = document.querySelector('#cardEditorOverType .overtype-input');

    isApplyingExternalEditorRefresh = true;
    try {
        setEditorFrontmatter(card.frontmatter);
        if (cardEditorTitle) {
            cardEditorTitle.textContent = card.frontmatter.title || '';
        }

        await renderActiveEditorMetadata(card.frontmatter, card.timestamps);

        if (activeCardEditorInstance && typeof activeCardEditorInstance.setValue === 'function') {
            activeCardEditorInstance.setValue(card.body);
        } else if (editorTextarea) {
            editorTextarea.value = card.body;
        }

        const liveTextarea = activeCardEditorInstance && activeCardEditorInstance.textarea
            ? activeCardEditorInstance.textarea
            : editorTextarea;
        if (liveTextarea) {
            liveTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setActiveEditorDiskState(cardPath, card);
        pendingEditorBody = '';
    } finally {
        isApplyingExternalEditorRefresh = false;
    }

    return true;
}

function enqueueEditorSave(bodyValue) {
    if (!isCardEditorActive()) {
        return editorSaveInFlight;
    }

    const bodyToSave = typeof bodyValue === 'string' ? bodyValue : '';
    editorSaveInFlight = editorSaveInFlight
        .then(() => saveEditorCard(bodyToSave))
        .catch((error) => {
            console.error('Failed to save card.', error);
        });

    return editorSaveInFlight;
}

function queueEditorSave(bodyValue) {
    if (!isCardEditorActive()) {
        return;
    }

    pendingEditorBody = typeof bodyValue === 'string' ? bodyValue : '';

    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
    }

    pendingEditorSaveTimer = setTimeout(() => {
        pendingEditorSaveTimer = null;
        enqueueEditorSave(pendingEditorBody);
    }, 300);
}

async function flushEditorSaveIfNeeded() {
    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
        pendingEditorSaveTimer = null;
        if (isCardEditorActive()) {
            enqueueEditorSave(pendingEditorBody);
        } else {
            pendingEditorBody = '';
        }
    }

    await editorSaveInFlight;
}

async function saveEditorCard(bodyValue) {
    if (!isCardEditorActive()) {
        return;
    }

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardPath = getActiveEditorCardPath();
    if (!cardPath) {
        return;
    }

    editorSaveOperationInFlight = true;

    try {
        const currentFrontmatter = getEditorFrontmatter();
        const normalizedFrontmatter = await window.board.normalizeFrontmatter({
            ...currentFrontmatter,
            title: cardEditorTitle.textContent.trim(),
        });
        const normalizedBody = typeof bodyValue === 'string' ? bodyValue : '';

        setEditorFrontmatter(normalizedFrontmatter);

        await window.board.writeCard(cardPath, {
            frontmatter: normalizedFrontmatter,
            body: normalizedBody,
        });
        updateCardEditorUpdatedTimestamp();

        setActiveEditorDiskState(cardPath, {
            frontmatter: normalizedFrontmatter,
            body: normalizedBody,
        });
    } finally {
        editorSaveOperationInFlight = false;
    }
}

let activeDueDatePickerInput = null;
let taskLineDueControlsTeardown = null;

function destroyActiveDueDatePicker() {
    if (activeDueDatePickerInput && activeDueDatePickerInput._fdatepicker) {
        activeDueDatePickerInput._fdatepicker.destroy();
    }

    if (activeDueDatePickerInput && activeDueDatePickerInput.parentNode) {
        activeDueDatePickerInput.parentNode.removeChild(activeDueDatePickerInput);
    }

    activeDueDatePickerInput = null;
}

function positionDueDatePickerAnchorInput(anchorInput, triggerElement) {
    if (!anchorInput || !triggerElement || typeof triggerElement.getBoundingClientRect !== 'function') {
        return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const top = Math.round(triggerRect.bottom + window.scrollY);
    const left = Math.round(triggerRect.left + window.scrollX);

    anchorInput.style.top = `${top}px`;
    anchorInput.style.left = `${left}px`;
}

function createDueDatePickerAnchorInput(triggerElement) {
    const anchorInput = document.createElement('input');
    anchorInput.type = 'text';
    anchorInput.className = 'due-date-picker-anchor-input';
    anchorInput.tabIndex = -1;
    anchorInput.setAttribute('aria-hidden', 'true');
    anchorInput.setAttribute('data-fdatepicker', 'due-date-anchor');

    anchorInput.style.position = 'absolute';
    anchorInput.style.height = '1px';
    anchorInput.style.width = '1px';
    anchorInput.style.opacity = '0';
    anchorInput.style.pointerEvents = 'none';
    anchorInput.style.zIndex = '-1';

    positionDueDatePickerAnchorInput(anchorInput, triggerElement);
    document.body.appendChild(anchorInput);

    return anchorInput;
}

function parseDueDateStringToDate(dueDateValue) {
    const normalizedDueDate = String(dueDateValue || '').trim();
    if (!normalizedDueDate) {
        return null;
    }

    const [year, month, day] = normalizedDueDate.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function captureTextareaScrollPosition(textarea) {
    if (!textarea) {
        return { top: 0, left: 0 };
    }

    return {
        top: Number.isFinite(textarea.scrollTop) ? textarea.scrollTop : 0,
        left: Number.isFinite(textarea.scrollLeft) ? textarea.scrollLeft : 0,
    };
}

function restoreTextareaScrollPosition(textarea, scrollPosition) {
    if (!textarea || !scrollPosition) {
        return;
    }

    if (Number.isFinite(scrollPosition.top)) {
        textarea.scrollTop = scrollPosition.top;
    }

    if (Number.isFinite(scrollPosition.left)) {
        textarea.scrollLeft = scrollPosition.left;
    }
}

function focusTextareaWithoutScrolling(textarea) {
    if (!textarea || typeof textarea.focus !== 'function') {
        return;
    }

    try {
        textarea.focus({ preventScroll: true });
    } catch {
        textarea.focus();
    }
}

function applyEditorTextareaValuePreservingScroll(textarea, nextValue, caretPosition) {
    if (!textarea) {
        return;
    }

    const scrollPosition = captureTextareaScrollPosition(textarea);
    textarea.value = nextValue;
    restoreTextareaScrollPosition(textarea, scrollPosition);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    window.requestAnimationFrame(() => {
        focusTextareaWithoutScrolling(textarea);
        if (typeof textarea.setSelectionRange === 'function' && Number.isInteger(caretPosition) && caretPosition >= 0) {
            textarea.setSelectionRange(caretPosition, caretPosition);
        }
        restoreTextareaScrollPosition(textarea, scrollPosition);
        window.requestAnimationFrame(() => {
            restoreTextareaScrollPosition(textarea, scrollPosition);
        });
    });
}

function openDueDatePickerAtTrigger({
    triggerElement,
    dueDateValue,
    onSelect,
}) {
    if (!triggerElement || typeof FDatepicker !== 'function') {
        return;
    }

    if (typeof closeAllLabelPopovers === 'function') {
        closeAllLabelPopovers();
    }

    destroyActiveDueDatePicker();

    const anchorInput = createDueDatePickerAnchorInput(triggerElement);
    activeDueDatePickerInput = anchorInput;

    const picker = new FDatepicker(anchorInput, {
        format: 'Y-m-d',
        autoClose: true,
    });

    const initialDate = parseDueDateStringToDate(dueDateValue);
    if (initialDate) {
        picker.setDate(initialDate);
    }

    picker.update({
        format: 'Y-m-d',
        autoClose: true,
        onClose: () => {
            setTimeout(() => {
                if (activeDueDatePickerInput === anchorInput) {
                    destroyActiveDueDatePicker();
                } else if (anchorInput && anchorInput.parentNode) {
                    if (anchorInput._fdatepicker) {
                        anchorInput._fdatepicker.destroy();
                    }
                    anchorInput.parentNode.removeChild(anchorInput);
                }
            }, 0);
        },
        onSelect: async (value) => {
            if (typeof onSelect === 'function') {
                await onSelect(value);
            }
        }
    });

    picker.open();
    if (picker.popup) {
        picker.popup.classList.add('sb-themed-fdatepicker');
        const clearButton = Array.from(
            picker.popup.querySelectorAll('.fdatepicker-button-text'),
        ).find((button) => String(button.textContent || '').trim().toLowerCase() === 'clear');

        if (clearButton) {
            clearButton.addEventListener('click', async () => {
                if (typeof onSelect === 'function') {
                    await onSelect('');
                }

                if (typeof picker.close === 'function') {
                    picker.close();
                }
            }, { once: true });
        }
    }
    if (typeof picker.setPosition === 'function') {
        picker.setPosition();
    }
}

function destroyTaskLineDueDateControls() {
    if (typeof taskLineDueControlsTeardown === 'function') {
        taskLineDueControlsTeardown();
    }

    taskLineDueControlsTeardown = null;
}

function getTaskLineDueControlIconMarkup(hasDueDate) {
    if (
        window.feather &&
        window.feather.icons &&
        typeof window.feather.icons.calendar?.toSvg === 'function'
    ) {
        return window.feather.icons.calendar.toSvg({
            width: 16,
            height: 16,
            stroke: 'currentColor',
        });
    }

    return '<i data-feather="calendar" aria-hidden="true"></i>';
}

function getTaskLineCheckboxIconMarkup(isCompleted) {
    const iconName = isCompleted ? 'check-square' : 'square';
    if (
        window.feather &&
        window.feather.icons &&
        typeof window.feather.icons[iconName]?.toSvg === 'function'
    ) {
        return window.feather.icons[iconName].toSvg({
            width: 16,
            height: 16,
            stroke: 'currentColor',
        });
    }

    return `<i data-feather="${iconName}" aria-hidden="true"></i>`;
}

function setupTaskLineDueDateControls(editor) {
    destroyTaskLineDueDateControls();

    if (!editor || !editor.textarea || !editor.container) {
        return;
    }

    const textarea = editor.textarea;
    const wrapper = editor.container.querySelector('.overtype-wrapper');
    const preview = editor.container.querySelector('.overtype-preview');
    if (!wrapper) {
        return;
    }

    const layer = document.createElement('div');
    layer.className = 'task-line-due-layer';
    wrapper.appendChild(layer);

    const toFiniteNumber = (value, fallback = 0) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    function getTaskLineAnchorOffset(taskItem, textValue, textLength) {
        if (!taskItem || !Number.isInteger(taskItem.lineStart)) {
            return null;
        }

        const rawLineStart = Math.min(
            Math.max(0, Number(taskItem.lineStart)),
            Math.max(0, textLength - 1),
        );
        const lineText = String(taskItem.line || '');
        const leadingWhitespaceMatch = lineText.match(/^\s*/);
        const leadingWhitespaceLength = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
        let anchorOffset = Math.min(rawLineStart + leadingWhitespaceLength, Math.max(0, textLength - 1));

        while (anchorOffset < textLength && textValue.charAt(anchorOffset) === '\n') {
            anchorOffset += 1;
        }

        if (anchorOffset >= textLength) {
            return null;
        }

        return anchorOffset;
    }

    function createTextareaMeasurementMirror() {
        const style = window.getComputedStyle(textarea);
        const mirror = document.createElement('div');
        const textareaRect = textarea.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();

        mirror.style.position = 'absolute';
        mirror.style.top = `${Math.round(textareaRect.top - layerRect.top)}px`;
        mirror.style.left = `${Math.round(textareaRect.left - layerRect.left)}px`;
        mirror.style.visibility = 'hidden';
        mirror.style.pointerEvents = 'none';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.overflowWrap = 'break-word';
        mirror.style.boxSizing = 'border-box';
        mirror.style.width = `${Math.max(textarea.clientWidth, 1)}px`;
        mirror.style.padding = style.padding;
        mirror.style.margin = '0';
        mirror.style.border = '0';
        mirror.style.font = style.font;
        mirror.style.lineHeight = style.lineHeight;
        mirror.style.letterSpacing = style.letterSpacing;
        mirror.style.textIndent = style.textIndent;
        mirror.style.textTransform = style.textTransform;
        mirror.style.textAlign = style.textAlign;
        mirror.style.direction = style.direction;
        mirror.style.tabSize = style.tabSize;
        mirror.style.wordSpacing = style.wordSpacing;
        mirror.style.webkitTextSizeAdjust = '100%';

        layer.appendChild(mirror);
        return mirror;
    }

    function getFirstRenderedLineRect(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
            return null;
        }

        const fallbackRect = element.getBoundingClientRect();
        if (typeof document.createRange !== 'function') {
            return fallbackRect;
        }

        const range = document.createRange();
        try {
            range.selectNodeContents(element);
            const clientRects = Array.from(range.getClientRects()).filter((rect) => (
                rect &&
                Number.isFinite(rect.top) &&
                Number.isFinite(rect.left) &&
                Number.isFinite(rect.height) &&
                rect.height > 0
            ));
            return clientRects[0] || fallbackRect;
        } finally {
            if (typeof range.detach === 'function') {
                range.detach();
            }
        }
    }

    function getLineStartPositionByTaskIndex(taskItems) {
        const positions = new Map();
        if (!Array.isArray(taskItems) || taskItems.length === 0) {
            return positions;
        }

        if (preview) {
            const previewChildren = Array.from(preview.children);
            const previewLineElements = new Map();
            const rawLines = String(textarea.value || '').split('\n');
            let lineIndex = 0;

            for (const child of previewChildren) {
                if (!(child instanceof HTMLElement)) {
                    continue;
                }

                const tagName = child.tagName;
                if (tagName === 'UL' || tagName === 'OL') {
                    const listItems = Array.from(child.children).filter((element) => element instanceof HTMLElement);
                    for (const listItem of listItems) {
                        previewLineElements.set(lineIndex, listItem);
                        lineIndex += 1;
                    }
                    continue;
                }

                if (tagName === 'PRE') {
                    const codeElement = child.querySelector('code');
                    const codeText = codeElement ? String(codeElement.textContent || '') : String(child.textContent || '');
                    const codeLineCount = Math.max(1, codeText.split('\n').length + 2);
                    for (let offset = 0; offset < codeLineCount; offset += 1) {
                        previewLineElements.set(lineIndex, child);
                        lineIndex += 1;
                    }
                    continue;
                }

                previewLineElements.set(lineIndex, child);
                lineIndex += 1;

                if (lineIndex >= rawLines.length) {
                    break;
                }
            }

            if (previewLineElements.size > 0) {
                const layerRect = layer.getBoundingClientRect();
                for (const taskItem of taskItems) {
                    const lineElement = previewLineElements.get(taskItem.lineIndex);
                    if (!lineElement) {
                        continue;
                    }

                    const rect = getFirstRenderedLineRect(lineElement);
                    if (!rect || (!Number.isFinite(rect.top) || !Number.isFinite(rect.left))) {
                        continue;
                    }

                    positions.set(taskItem.lineIndex, {
                        top: rect.top - layerRect.top + preview.scrollTop,
                        left: rect.left - layerRect.left + preview.scrollLeft,
                        height: rect.height,
                    });
                }
            }

            if (positions.size > 0) {
                return positions;
            }
        }

        const textValue = String(textarea.value || '');
        const mirror = createTextareaMeasurementMirror();
        try {
            const sortedTaskItems = [...taskItems]
                .filter((item) => item && Number.isInteger(item.lineIndex) && Number.isInteger(item.lineStart))
                .sort((a, b) => a.lineStart - b.lineStart);
            const textLength = textValue.length;
            const layerRect = layer.getBoundingClientRect();
            let cursor = 0;
            const markersByLineIndex = new Map();

            for (const taskItem of sortedTaskItems) {
                const anchorOffset = getTaskLineAnchorOffset(taskItem, textValue, textLength);
                if (anchorOffset === null) {
                    continue;
                }

                if (anchorOffset > cursor) {
                    mirror.appendChild(document.createTextNode(textValue.slice(cursor, anchorOffset)));
                }

                const marker = document.createElement('span');
                marker.textContent = '\u200b';
                marker.setAttribute('aria-hidden', 'true');
                marker.style.display = 'inline';
                marker.style.padding = '0';
                marker.style.margin = '0';
                marker.style.border = '0';
                marker.style.lineHeight = 'inherit';
                marker.style.pointerEvents = 'none';
                mirror.appendChild(marker);
                markersByLineIndex.set(taskItem.lineIndex, marker);

                cursor = anchorOffset;
            }

            if (cursor < textLength) {
                mirror.appendChild(document.createTextNode(textValue.slice(cursor)));
            } else if (textLength === 0) {
                mirror.appendChild(document.createTextNode(' '));
            }

            for (const taskItem of sortedTaskItems) {
                const marker = markersByLineIndex.get(taskItem.lineIndex);
                if (!marker) {
                    continue;
                }

                const rect = marker.getBoundingClientRect();
                if (!rect || (!Number.isFinite(rect.top) || !Number.isFinite(rect.left))) {
                    continue;
                }

                positions.set(taskItem.lineIndex, {
                    top: rect.top - layerRect.top,
                    left: rect.left - layerRect.left,
                    height: rect.height,
                });
            }
        } finally {
            mirror.remove();
        }

        return positions;
    }

    function renderTaskLineDueButtons() {
        const taskItems = parseTaskListItems(textarea.value);
        layer.innerHTML = '';

        if (taskItems.length === 0) {
            return;
        }

        const style = window.getComputedStyle(textarea);
        const fontSize = toFiniteNumber(style.fontSize, 16);
        const lineHeight = Math.max(toFiniteNumber(style.lineHeight, fontSize * 1.6), 1);
        const controlSize = 18;
        const lineStartPositions = getLineStartPositionByTaskIndex(taskItems);
        const visibleTop = -lineHeight;
        const visibleBottom = textarea.clientHeight + lineHeight;

        for (const taskItem of taskItems) {
            const linePosition = lineStartPositions.get(taskItem.lineIndex);
            if (!linePosition) {
                continue;
            }

            const measuredLineHeight = Math.max(toFiniteNumber(linePosition.height, lineHeight), lineHeight);
            const buttonTop = Math.round(
                linePosition.top - textarea.scrollTop + ((measuredLineHeight - controlSize) / 2) + -3,
            );
            if (buttonTop < visibleTop || buttonTop > visibleBottom) {
                continue;
            }

            const controlLeft = Math.max(1, Math.round(linePosition.left - textarea.scrollLeft - 38));

            const checkbox = document.createElement('button');
            checkbox.type = 'button';
            checkbox.className = 'task-line-checkbox-control';
            if (taskItem.isCompleted) {
                checkbox.classList.add('is-completed');
            }
            checkbox.dataset.lineIndex = String(taskItem.lineIndex);
            checkbox.style.top = `${buttonTop}px`;
            checkbox.style.left = `${controlLeft}px`;
            checkbox.title = taskItem.isCompleted ? 'Mark incomplete' : 'Mark complete';
            checkbox.setAttribute('aria-label', taskItem.isCompleted ? 'Mark task incomplete' : 'Mark task complete');
            checkbox.innerHTML = getTaskLineCheckboxIconMarkup(taskItem.isCompleted);
            checkbox.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const targetLineIndex = Number(checkbox.dataset.lineIndex);
                const liveTaskItems = parseTaskListItems(textarea.value);
                const liveTaskItem = liveTaskItems.find((item) => item.lineIndex === targetLineIndex);
                if (!liveTaskItem) {
                    return;
                }

                const nextValue = setTaskListItemCompletionByLineIndex(textarea.value, targetLineIndex, !liveTaskItem.isCompleted);
                if (nextValue === textarea.value) {
                    return;
                }

                const caretPosition = getLineEndOffsetByLineIndex(nextValue, targetLineIndex);
                applyEditorTextareaValuePreservingScroll(textarea, nextValue, caretPosition);
            });

            layer.appendChild(checkbox);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'task-line-due-control';
            button.dataset.lineIndex = String(taskItem.lineIndex);
            button.style.top = `${buttonTop}px`;
            button.style.left = `${Math.round(controlLeft + 20)}px`;

            if (taskItem.due) {
                const dueLabel = formatLongDueDateLabel(taskItem.due);
                button.classList.add('has-due');
                button.title = `Due ${dueLabel}`;
                button.setAttribute('aria-label', `Due ${dueLabel}. Change due date.`);
            } else {
                button.title = 'Set task due date';
                button.setAttribute('aria-label', 'Set task due date');
            }

            button.innerHTML = getTaskLineDueControlIconMarkup(Boolean(taskItem.due));
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const targetLineIndex = Number(button.dataset.lineIndex);
                const liveTaskItems = parseTaskListItems(textarea.value);
                const liveTaskItem = liveTaskItems.find((item) => item.lineIndex === targetLineIndex);
                if (!liveTaskItem) {
                    return;
                }

                openDueDatePickerAtTrigger({
                    triggerElement: button,
                    dueDateValue: liveTaskItem.due,
                    onSelect: async (value) => {
                        const nextValue = setTaskListItemDueDateByLineIndex(textarea.value, targetLineIndex, value);
                        if (nextValue === textarea.value) {
                            return;
                        }

                        const caretPosition = getLineEndOffsetByLineIndex(nextValue, targetLineIndex);
                        applyEditorTextareaValuePreservingScroll(textarea, nextValue, caretPosition);
                    },
                });
            });

            layer.appendChild(button);
        }
    }

    let renderRafId = 0;
    const requestRender = () => {
        if (renderRafId) {
            return;
        }

        renderRafId = window.requestAnimationFrame(() => {
            renderRafId = 0;
            renderTaskLineDueButtons();
        });
    };

    textarea.addEventListener('input', requestRender);
    textarea.addEventListener('scroll', requestRender);
    window.addEventListener('resize', requestRender);

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
            requestRender();
        });
        resizeObserver.observe(textarea);
        resizeObserver.observe(wrapper);
        if (editor.container) {
            resizeObserver.observe(editor.container);
        }
    }

    let containerMutationObserver = null;
    if (typeof MutationObserver === 'function' && editor.container) {
        containerMutationObserver = new MutationObserver(() => {
            requestRender();
        });
        containerMutationObserver.observe(editor.container, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    }

    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        document.fonts.ready.then(() => {
            requestRender();
        }).catch(() => {});
    }

    requestRender();

    taskLineDueControlsTeardown = () => {
        if (renderRafId) {
            window.cancelAnimationFrame(renderRafId);
            renderRafId = 0;
        }

        textarea.removeEventListener('input', requestRender);
        textarea.removeEventListener('scroll', requestRender);
        window.removeEventListener('resize', requestRender);
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        if (containerMutationObserver) {
            containerMutationObserver.disconnect();
        }

        if (layer.parentNode) {
            layer.parentNode.removeChild(layer);
        }
    };
}

async function toggleEditCardModal(cardPath, options = {}) {
    const shouldOpenDueDatePicker = Boolean(options && options.openDueDatePicker);
    const shouldFocusNotes = Boolean(options && options.focusNotes);
    const modalEditCard = document.getElementById('modalEditCard');
    destroyTaskLineDueDateControls();

    const card = await window.board.readCard(cardPath);

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardID = await window.board.getCardID(cardPath);
    const cardEditorCardID = document.getElementById('cardEditorCardID');
    cardEditorCardID.textContent = cardID;
    cardEditorCardID.setAttribute('aria-label', `Open card file ${cardID}`);
    cardEditorCardID.onclick = (e) => {
        e.preventDefault();
        window.board.openCard(cardEditorCardPath.value);
    };

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');
    const cardEditorSetLabelsLink = document.getElementById('cardEditorSetLabelsLink');

    setEditorFrontmatter(card.frontmatter);
    setActiveEditorDiskState(cardPath, card);
    cardEditorCardPath.value = cardPath;
    cardEditorTitle.textContent = card.frontmatter.title || '';
    cardEditorCardDueDateDisplay.textContent = '';
    setDueDateVisualClass(cardEditorSetDueDateLink, '');
    setEditorLabelDisplay(card.frontmatter.labels);
    renderCardEditorRelatedNotes(card.frontmatter);
    renderCardEditorTimestamps(card.timestamps);

    if (card.frontmatter.due) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(card.frontmatter.due);
        setDueDateVisualClass(cardEditorSetDueDateLink, card.frontmatter.due);
    }

    const [editor] = new OverType('#cardEditorOverType', {
        value: card.body,
        fontSize: '16px',
        lineHeight: 1.6,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
        padding: '16px',
        toolbar: true,
        placeholder: 'Notes...',
        onChange: handleNotesSave
    });
    activeCardEditorInstance = editor;

    if (typeof applyEditorThemeFromActiveMode === 'function') {
        applyEditorThemeFromActiveMode();
    } else if (getBoardThemeMode() === 'dark') {
        OverType.setTheme(customOverTypeThemes.dark);
    } else {
        OverType.setTheme(customOverTypeThemes.light);
    }

    editor.setValue(card.body);
    removeViewModeToolbarButton(editor);
    editor.container.classList.remove('preview-mode');
    editor.container.classList.remove('plain-mode');
    addTimestampToolbarButton(editor);
    setupTaskLineDueDateControls(editor);

    cardEditorTitle.onkeydown = (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }
    };

    cardEditorTitle.onkeyup = async (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }

        const cardEditorContents = document.getElementsByClassName('overtype-input');
        await handleNotesSave(cardEditorContents[0].value,false);
    };

    const openDueDatePickerControl = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editorFrontmatter = getEditorFrontmatter();
        openDueDatePickerAtTrigger({
            triggerElement: cardEditorSetDueDateLink,
            dueDateValue: editorFrontmatter.due,
            onSelect: async (value) => {
                await handleMetadataSave(value, 'due');
            },
        });
    };
    cardEditorSetDueDateLink.onclick = openDueDatePickerControl;

    if (cardEditorSetLabelsLink) {
      cardEditorSetLabelsLink.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const frontmatter = getEditorFrontmatter();
        const selectedLabels = Array.isArray(frontmatter.labels) ? frontmatter.labels : [];

        toggleCardLabelSelector(
            cardEditorSetLabelsLink,
            cardEditorCardPath.value,
            selectedLabels,
            async (nextLabelIds) => {
                const currentFrontmatter = getEditorFrontmatter();
                const normalizedFrontmatter = await window.board.normalizeFrontmatter({
                    ...currentFrontmatter,
                    labels: nextLabelIds,
                });

                setEditorFrontmatter(normalizedFrontmatter);
                setEditorLabelDisplay(normalizedFrontmatter.labels);

                const cardEditorContents = document.getElementsByClassName('overtype-input');
                pendingEditorBody = cardEditorContents[0]?.value || '';
                await flushEditorSaveIfNeeded();
                await enqueueEditorSave(pendingEditorBody);
            },
        );
      };
    }

    const cardEditorArchiveLink = document.getElementById('cardEditorArchiveLink');
    cardEditorArchiveLink.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await archiveActiveEditorCard();

        return;
    };

    const cardEditorDupeLink = document.getElementById('cardEditorDupeLink');
    cardEditorDupeLink.removeEventListener('click', handleClickDuplicateCard, { once: true });
    cardEditorDupeLink.addEventListener('click', handleClickDuplicateCard, {once:true});

    const cardEditorShareLink = document.getElementById('cardEditorShareLink');
    if (cardEditorShareLink) {
        cardEditorShareLink.removeEventListener('click', handleClickShareCard);
        cardEditorShareLink.addEventListener('click', handleClickShareCard);
    }

    const cardEditorOpenWithLink = document.getElementById('cardEditorOpenWithLink');
    if (cardEditorOpenWithLink) {
        cardEditorOpenWithLink.removeEventListener('click', toggleCardEditorOpenWithPopover);
        cardEditorOpenWithLink.addEventListener('click', toggleCardEditorOpenWithPopover);
    }

    const cardEditorLinkedObjectsLink = document.getElementById('cardEditorLinkedObjectsLink');
    if (cardEditorLinkedObjectsLink) {
        cardEditorLinkedObjectsLink.removeEventListener('click', toggleCardEditorLinkedObjectsPopover);
        cardEditorLinkedObjectsLink.addEventListener('click', toggleCardEditorLinkedObjectsPopover);
    }
    initializeCardEditorDropLinking(modalEditCard);

    const cardEditorMoveListLink = document.getElementById('cardEditorMoveListLink');
    if (cardEditorMoveListLink) {
        cardEditorMoveListLink.removeEventListener('click', handleClickMoveCard);
        cardEditorMoveListLink.addEventListener('click', handleClickMoveCard);
        await updateCardEditorMoveLink(cardEditorCardPath.value);
    }

    const cardEditorListSelect = document.getElementById('cardEditorListSelect');
    if (cardEditorListSelect) {
        cardEditorListSelect.removeEventListener('change', handleChangeCardListSelect);
        cardEditorListSelect.addEventListener('change', handleChangeCardListSelect);
        await updateCardEditorListDropdown(cardEditorCardPath.value);
    }

    const cardEditorClose = document.getElementById('cardEditorClose');
    cardEditorClose.removeEventListener('click', handleClickCloseCard, { once: true });
    cardEditorClose.addEventListener('click', handleClickCloseCard, {once:true});

    if (typeof setAccessibleModalVisible === 'function') {
        setAccessibleModalVisible(modalEditCard, true, {
            display: 'flex',
            initialFocus: shouldOpenDueDatePicker
                ? '#cardEditorSetDueDateLink'
                : (shouldFocusNotes ? '#cardEditorOverType .overtype-input' : '#cardEditorTitle'),
            labelledBy: 'cardEditorTitle',
        });
    } else {
        modalEditCard.style.display = 'flex';
        modalEditCard.classList.remove('hidden');
        modalEditCard.setAttribute('aria-hidden', 'false');
    }
    if (editor && editor.textarea) {
        editor.textarea.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(false);
    } else {
        const board = document.getElementById('board');
        if (board) {
            board.style.filter = 'blur(3px)';
            board.style.pointerEvents = 'none';
            board.style.userSelect = 'none';
        }
    }

    if (shouldOpenDueDatePicker) {
        cardEditorSetDueDateLink.focus();
        const editorFrontmatter = getEditorFrontmatter();
        openDueDatePickerAtTrigger({
            triggerElement: cardEditorSetDueDateLink,
            dueDateValue: editorFrontmatter.due,
            onSelect: async (value) => {
                await handleMetadataSave(value, 'due');
            },
        });
    } else if (shouldFocusNotes && editor && editor.textarea) {
        window.requestAnimationFrame(() => {
            focusTextareaWithoutScrolling(editor.textarea);
            const endPosition = String(editor.textarea.value || '').length;
            if (typeof editor.textarea.setSelectionRange === 'function') {
                editor.textarea.setSelectionRange(endPosition, endPosition);
            }
        });
    }

    return;
}

async function handleNotesSave(value,instance) {
    if (isApplyingExternalEditorRefresh) {
        return;
    }

    if ( value === 'Notes...' ) {
        return;
    }

    queueEditorSave(value);

    return;
};

async function handleMetadataSave(value,metaName) {
    if (metaName !== 'due') {
        return;
    }

    const cardEditorContents = document.getElementsByClassName('overtype-input');
    const frontmatter = getEditorFrontmatter();

    const normalizedDueValue = value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value || '').trim();

    const normalizedFrontmatter = await window.board.normalizeFrontmatter({
        ...frontmatter,
        due: normalizedDueValue.length > 0 ? normalizedDueValue : null,
    });

    setEditorFrontmatter(normalizedFrontmatter);

    pendingEditorBody = cardEditorContents[0]?.value || '';
    await flushEditorSaveIfNeeded();
    await enqueueEditorSave(pendingEditorBody);

    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');

    if ( normalizedFrontmatter.due ) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(normalizedFrontmatter.due);
        setDueDateVisualClass(cardEditorSetDueDateLink, normalizedFrontmatter.due);
    } else {
        cardEditorCardDueDateDisplay.textContent = '';
        setDueDateVisualClass(cardEditorSetDueDateLink, '');
    }

    return;
};

function getCardListPath(cardPath) {
    const normalized = String(cardPath || '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) {
        return '';
    }
    return normalized.slice(0, lastSlash);
}

function getPathDirectoryName(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : '';
}

function getCardEditorListDisplayName(directoryName) {
    const normalized = String(directoryName || '');
    const listNameMatch = normalized.match(/^\d{3}-(.*?)(-[^-]{5}|-stock)$/);
    if (listNameMatch) {
        return listNameMatch[1];
    }

    if (/^\d{3}-.+/.test(normalized)) {
        return normalized.slice(4);
    }

    return normalized || 'Untitled';
}

async function getOrderedListPaths() {
    if (!window.boardRoot) {
        return [];
    }
    const listNames = await window.board.listLists(window.boardRoot);
    return listNames.map((listName) => window.boardRoot + listName);
}

async function updateCardEditorListDropdown(cardPath) {
    const listSelect = document.getElementById('cardEditorListSelect');
    if (!listSelect) {
        return;
    }

    const listPaths = await getOrderedListPaths();
    const currentListPath = getCardListPath(cardPath);

    listSelect.innerHTML = '';

    if (listPaths.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No lists';
        listSelect.appendChild(emptyOption);
        listSelect.disabled = true;
        return;
    }

    for (const listPath of listPaths) {
        const option = document.createElement('option');
        option.value = listPath;
        option.textContent = getCardEditorListDisplayName(getPathDirectoryName(listPath));
        if (listPath === currentListPath) {
            option.selected = true;
        }
        listSelect.appendChild(option);
    }

    if (!listPaths.includes(currentListPath)) {
        listSelect.value = listPaths[0];
    }

    listSelect.disabled = false;
}

async function resolveCardMoveTarget(cardPath, direction = 'auto') {
    const listPaths = await getOrderedListPaths();
    const currentListPath = getCardListPath(cardPath);
    const currentIndex = listPaths.indexOf(currentListPath);

    if (currentIndex === -1) {
        return {
            listPaths,
            currentIndex,
            targetIndex: -1,
            targetPath: '',
            isLeftmost: false,
            isRightmost: false,
            direction: '',
        };
    }

    const isLeftmost = currentIndex === 0;
    const isRightmost = currentIndex === listPaths.length - 1;
    let targetIndex = -1;

    if (direction === 'left') {
        targetIndex = isLeftmost ? -1 : currentIndex - 1;
    } else if (direction === 'right') {
        targetIndex = isRightmost ? -1 : currentIndex + 1;
    } else {
        targetIndex = isRightmost ? currentIndex - 1 : currentIndex + 1;
    }

    const targetPath = (targetIndex >= 0 && targetIndex < listPaths.length)
        ? listPaths[targetIndex]
        : '';

    return {
        listPaths,
        currentIndex,
        targetIndex,
        targetPath,
        isLeftmost,
        isRightmost,
        direction: targetPath ? (targetIndex < currentIndex ? 'left' : 'right') : '',
    };
}

async function moveCardToTopOfListPath(cardPath, targetListPath) {
    if (!cardPath || !targetListPath) {
        return '';
    }

    const currentListPath = getCardListPath(cardPath);
    if (!currentListPath || currentListPath === targetListPath) {
        return '';
    }

    if (!window.board || typeof window.board.moveCardToTop !== 'function') {
        return '';
    }

    const result = await window.board.moveCardToTop(cardPath, targetListPath);
    return result && result.cardPath ? result.cardPath : '';
}

function showCardEditorListMoveFeedback() {
    const feedbackEl = document.getElementById('cardEditorListMoveFeedback');
    if (!feedbackEl) {
        return;
    }

    if (cardEditorListMoveFeedbackTimer) {
        clearTimeout(cardEditorListMoveFeedbackTimer);
        cardEditorListMoveFeedbackTimer = null;
    }

    feedbackEl.classList.remove('is-visible');
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add('is-visible');

    cardEditorListMoveFeedbackTimer = setTimeout(() => {
        feedbackEl.classList.remove('is-visible');
        cardEditorListMoveFeedbackTimer = null;
    }, 1200);
}

async function refreshCardEditorAfterMove(newPath) {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (cardEditorCardPath) {
        cardEditorCardPath.value = newPath;
    }

    const cardEditorCardID = document.getElementById('cardEditorCardID');
    if (cardEditorCardID) {
        const cardID = await window.board.getCardID(newPath);
        cardEditorCardID.textContent = cardID;
        cardEditorCardID.setAttribute('aria-label', `Open card file ${cardID}`);
    }

    try {
        const movedCard = await window.board.readCard(newPath);
        setEditorFrontmatter(movedCard.frontmatter);
        await renderActiveEditorMetadata(movedCard.frontmatter, movedCard.timestamps);
        setActiveEditorDiskState(newPath, movedCard);
    } catch (error) {
        console.error('Failed to refresh moved card metadata.', error);
        updateCardEditorUpdatedTimestamp();
    }

    await renderBoard();
    await updateCardEditorMoveLink(newPath);
    await updateCardEditorListDropdown(newPath);
    if (typeof announceSignboardStatus === 'function') {
        const targetListName = getCardEditorListDisplayName(getPathDirectoryName(getCardListPath(newPath)));
        announceSignboardStatus(`Moved card to ${targetListName}.`);
    }
}

function setCardEditorMoveIcon(moveLink, iconName) {
    if (!moveLink || !window.feather || !window.feather.icons || !window.feather.icons[iconName]) {
        return;
    }

    moveLink.innerHTML = window.feather.icons[iconName].toSvg();
    const svgIcon = moveLink.querySelector('svg');
    if (svgIcon) {
        svgIcon.setAttribute('aria-hidden', 'true');
        svgIcon.setAttribute('focusable', 'false');
    }
}

async function updateCardEditorMoveLink(cardPath) {
    const moveLink = document.getElementById('cardEditorMoveListLink');
    if (!moveLink) {
        return null;
    }

    const moveInfo = await resolveCardMoveTarget(cardPath);
    const isRightmost = moveInfo.listPaths.length > 0 && moveInfo.isRightmost;
    const iconName = isRightmost ? 'arrow-left' : 'arrow-right';
    const title = isRightmost ? 'Move to previous list' : 'Move to next list';

    setCardEditorMoveIcon(moveLink, iconName);
    moveLink.title = title;
    moveLink.setAttribute('aria-label', title);
    moveLink.dataset.targetPath = moveInfo.targetPath || '';
    moveLink.dataset.direction = isRightmost ? 'left' : 'right';

    return moveInfo;
}

async function handleClickMoveCard(e) {
    e.preventDefault();
    e.stopPropagation();

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (!cardEditorCardPath || !cardEditorCardPath.value) {
        return;
    }

    await flushEditorSaveIfNeeded();

    const moveInfo = await resolveCardMoveTarget(cardEditorCardPath.value);
    if (!moveInfo || !moveInfo.targetPath) {
        await updateCardEditorMoveLink(cardEditorCardPath.value);
        return;
    }

    const newPath = await moveCardToTopOfListPath(cardEditorCardPath.value, moveInfo.targetPath);
    if (!newPath) {
        return;
    }

    await refreshCardEditorAfterMove(newPath);
    return;
}

async function moveActiveEditorCardToAdjacentList(direction) {
    const normalizedDirection = direction === 'left' ? 'left' : 'right';
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (!cardEditorCardPath || !cardEditorCardPath.value || !isCardEditorActive()) {
        return false;
    }

    await flushEditorSaveIfNeeded();

    const moveInfo = await resolveCardMoveTarget(cardEditorCardPath.value, normalizedDirection);
    if (!moveInfo || !moveInfo.targetPath) {
        await updateCardEditorMoveLink(cardEditorCardPath.value);
        return false;
    }

    const newPath = await moveCardToTopOfListPath(cardEditorCardPath.value, moveInfo.targetPath);
    if (!newPath) {
        return false;
    }

    await refreshCardEditorAfterMove(newPath);
    showCardEditorListMoveFeedback();
    return true;
}

async function handleChangeCardListSelect(e) {
    e.stopPropagation();

    const listSelect = e.currentTarget;
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (!listSelect || !cardEditorCardPath || !cardEditorCardPath.value) {
        return;
    }

    const targetListPath = String(listSelect.value || '').trim();
    if (!targetListPath) {
        return;
    }

    const currentListPath = getCardListPath(cardEditorCardPath.value);
    if (targetListPath === currentListPath) {
        return;
    }

    if (typeof waitForNativeMenuTrackingToSettle === 'function') {
        await waitForNativeMenuTrackingToSettle();
    }

    if (!listSelect.isConnected || listSelect.value !== targetListPath || !isCardEditorActive()) {
        return;
    }

    const latestCardPath = document.getElementById('cardEditorCardPath')?.value || cardEditorCardPath.value;
    if (!latestCardPath || targetListPath === getCardListPath(latestCardPath)) {
        return;
    }

    listSelect.disabled = true;

    try {
        await flushEditorSaveIfNeeded();
        const newPath = await moveCardToTopOfListPath(latestCardPath, targetListPath);
        if (!newPath) {
            return;
        }

        await refreshCardEditorAfterMove(newPath);
        showCardEditorListMoveFeedback();
    } finally {
        const latestCardPath = document.getElementById('cardEditorCardPath')?.value || cardEditorCardPath.value;
        await updateCardEditorListDropdown(latestCardPath);
    }

    return;
}

async function archiveActiveEditorCard() {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardPath = cardEditorCardPath ? String(cardEditorCardPath.value || '').trim() : '';
    if (!cardPath || !isCardEditorActive()) {
        return false;
    }

    await flushEditorSaveIfNeeded();
    await window.board.archiveCard(cardPath);
    clearQueuedEditorSave();
    cardEditorCardPath.value = '';
    await closeAllModals(createCloseAllModalsRequest());
    if (typeof announceSignboardStatus === 'function') {
        announceSignboardStatus('Archived card.');
    }
    return true;
}

async function handleClickCloseCard( e ) {
    e.preventDefault();
    e.stopPropagation();
    await closeAllModals(createCloseAllModalsRequest());
    return;
}

async function handleClickShareCard(e) {
    e.preventDefault();
    e.stopPropagation();

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardPath = cardEditorCardPath ? String(cardEditorCardPath.value || '').trim() : '';
    if (!cardPath) {
        return;
    }

    await flushEditorSaveIfNeeded();

    try {
        const result = await window.board.shareCard(cardPath);
        if (!result || result.ok !== true) {
            console.error('Unable to share card file.', result && result.error ? result.error : 'UNKNOWN');
        }
    } catch (error) {
        console.error('Unable to share card file.', error);
    }
}

function closeCardEditorOpenWithPopover() {
    const popover = document.getElementById('cardEditorOpenWithPopover');
    const trigger = document.getElementById('cardEditorOpenWithLink');
    if (!popover) {
        return;
    }

    popover.classList.add('hidden');
    popover.setAttribute('aria-hidden', 'true');
    popover.innerHTML = '';
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
    }
}

function closeCardEditorOpenWithPopoverIfClickOutside(target) {
    const popover = document.getElementById('cardEditorOpenWithPopover');
    const trigger = document.getElementById('cardEditorOpenWithLink');
    if (!popover || popover.classList.contains('hidden')) {
        return;
    }

    if (
        (popover.contains(target)) ||
        (trigger && trigger.contains(target))
    ) {
        return;
    }

    closeCardEditorOpenWithPopover();
}

function closeCardEditorLinkedObjectsPopover() {
    const popover = document.getElementById('cardEditorLinkedObjectsPopover');
    const trigger = document.getElementById('cardEditorLinkedObjectsLink');
    if (!popover) {
        return;
    }

    popover.classList.add('hidden');
    popover.setAttribute('aria-hidden', 'true');
    popover.innerHTML = '';
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
    }
}

function closeCardEditorLinkedObjectsPopoverIfClickOutside(target) {
    const popover = document.getElementById('cardEditorLinkedObjectsPopover');
    const trigger = document.getElementById('cardEditorLinkedObjectsLink');
    if (!popover || popover.classList.contains('hidden')) {
        return;
    }

    if (
        (popover.contains(target)) ||
        (trigger && trigger.contains(target))
    ) {
        return;
    }

    closeCardEditorLinkedObjectsPopover();
}

function setCardEditorOpenWithPopoverPosition(trigger, popover) {
    if (!trigger || !popover || typeof trigger.getBoundingClientRect !== 'function') {
        return;
    }

    const viewportPadding = 8;
    const rect = trigger.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.left = '0px';
    popover.style.top = '0px';

    const popoverRect = popover.getBoundingClientRect();
    const preferredLeft = rect.right - popoverRect.width;
    const left = Math.min(
        window.innerWidth - popoverRect.width - viewportPadding,
        Math.max(viewportPadding, preferredLeft),
    );

    let top = rect.bottom + 8;
    if (top + popoverRect.height > window.innerHeight - viewportPadding) {
        const aboveTrigger = rect.top - popoverRect.height - 8;
        if (aboveTrigger >= viewportPadding) {
            top = aboveTrigger;
        } else {
            top = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);
        }
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
}

function createCardEditorOpenWithAction({ label, icon, onClick, disabled = false, closeOnClick = true }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-menu-action card-editor-open-with-action';
    button.disabled = disabled;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'board-menu-action-icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    if (window.feather && window.feather.icons && window.feather.icons[icon]) {
        iconWrap.innerHTML = window.feather.icons[icon].toSvg();
    }
    button.appendChild(iconWrap);

    const labelEl = document.createElement('span');
    labelEl.className = 'board-menu-action-label';
    labelEl.textContent = label;
    button.appendChild(labelEl);

    button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) {
            return;
        }
        if (closeOnClick) {
            closeCardEditorOpenWithPopover();
            closeCardEditorLinkedObjectsPopover();
        }
        await onClick();
    });

    return button;
}

function appendCardEditorOpenWithSeparator(popover) {
    if (!popover) {
        return;
    }

    const separator = document.createElement('div');
    separator.className = 'label-popover-separator';
    popover.appendChild(separator);
}

async function getActiveCardExternalLinkInfo() {
    const cardPath = getActiveEditorCardPath();
    if (!cardPath || !window.board || typeof window.board.getCardExternalLinks !== 'function') {
        return {
            inObsidianVault: false,
        };
    }

    try {
        const result = await window.board.getCardExternalLinks(cardPath);
        return result && result.ok
            ? result
            : { inObsidianVault: false };
    } catch (error) {
        console.error('Unable to inspect card external links.', error);
        return {
            inObsidianVault: false,
        };
    }
}

async function runCardExternalAction(action, successMessage) {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardPath = cardEditorCardPath ? String(cardEditorCardPath.value || '').trim() : '';
    if (!cardPath || !isCardEditorActive()) {
        return null;
    }

    await flushEditorSaveIfNeeded();

    let result = null;
    try {
        result = await action(cardPath);
        if (result && result.ok === false) {
            console.error('Card external action failed.', result.error || 'UNKNOWN');
            if (typeof announceSignboardStatus === 'function') {
                announceSignboardStatus('Action failed.');
            }
            return result;
        }

        const normalizedSuccessMessage = typeof successMessage === 'function'
            ? successMessage(result)
            : successMessage;
        if (normalizedSuccessMessage && typeof announceSignboardStatus === 'function') {
            announceSignboardStatus(normalizedSuccessMessage);
        }
    } catch (error) {
        console.error('Card external action failed.', error);
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Action failed.');
        }
    }

    return result;
}

async function createLinkedObsidianNoteForActiveCard() {
    const result = await runCardExternalAction(
        (cardPath) => window.board.createLinkedObsidianNote(window.boardRoot, cardPath),
        (actionResult) => {
            const noteName = actionResult && actionResult.notePath
                ? window.board.getCardFileName(actionResult.notePath)
                : '';
            return noteName
                ? `Linked ${noteName}.`
                : 'Created linked Obsidian note.';
        },
    );
    const cardPath = getActiveEditorCardPath();
    if (result && result.ok && cardPath) {
        await refreshEditorAfterExternalFrontmatterChange(cardPath);
    }
}

async function addLinkedObjectToActiveCard(linkedObjectInput) {
    const cardPath = getActiveEditorCardPath();
    if (!cardPath || !window.board || typeof window.board.addLinkedObject !== 'function') {
        return null;
    }

    try {
        const result = await window.board.addLinkedObject(cardPath, linkedObjectInput);
        if (!result || result.ok === false) {
            if (typeof announceSignboardStatus === 'function') {
                announceSignboardStatus('Unable to link object.');
            }
            return result;
        }

        if (result.frontmatter) {
            setEditorFrontmatter(result.frontmatter);
            await renderActiveEditorMetadata(result.frontmatter);
            setActiveEditorDiskState(cardPath, {
                frontmatter: result.frontmatter,
                body: getEditorBodyValue(),
            });
        } else {
            await refreshEditorAfterExternalFrontmatterChange(cardPath);
        }

        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Linked object.');
        }
        return result;
    } catch (error) {
        console.error('Unable to link object.', error);
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Unable to link object.');
        }
        return null;
    }
}

async function addPickedLinkedObjects(mode) {
    if (!window.chooser || typeof window.chooser.pickLinkedObjects !== 'function') {
        return;
    }

    const selections = await window.chooser.pickLinkedObjects({ mode });
    if (!Array.isArray(selections) || selections.length === 0) {
        return;
    }

    for (const selection of selections) {
        await addLinkedObjectToActiveCard({
            type: selection.kind === 'folder' ? 'folder' : 'file',
            token: selection.token,
        });
    }
}

function cardEditorDragEventHasFiles(event) {
    const dataTransfer = event ? event.dataTransfer : null;
    const types = dataTransfer && dataTransfer.types ? Array.from(dataTransfer.types) : [];
    if (types.includes('Files')) {
        return true;
    }

    const files = dataTransfer && dataTransfer.files ? dataTransfer.files : null;
    if (files && files.length > 0) {
        return true;
    }

    const items = dataTransfer && dataTransfer.items ? Array.from(dataTransfer.items) : [];
    return items.some((item) => item && item.kind === 'file');
}

function setCardEditorDropActive(active) {
    const modalEditCard = document.getElementById('modalEditCard');
    if (!modalEditCard) {
        return;
    }

    modalEditCard.classList.toggle('card-editor-drop-active', Boolean(active));
}

function clearCardEditorDropState() {
    cardEditorDropDepth = 0;
    setCardEditorDropActive(false);
}

async function addDroppedLinkedObjectsToActiveCard(files) {
    const cardPath = getActiveEditorCardPath();
    const linkDroppedObjects = typeof window.__signboardTestLinkDroppedObjects === 'function'
        ? window.__signboardTestLinkDroppedObjects
        : (window.chooser && typeof window.chooser.linkDroppedObjects === 'function' ? window.chooser.linkDroppedObjects : null);
    if (
        !cardPath ||
        !linkDroppedObjects
    ) {
        return null;
    }

    try {
        const result = await linkDroppedObjects(cardPath, files);
        if (!result || result.ok === false) {
            if (typeof announceSignboardStatus === 'function') {
                announceSignboardStatus('Unable to link dropped files.');
            }
            return result;
        }

        if (result.frontmatter) {
            setEditorFrontmatter(result.frontmatter);
            await renderActiveEditorMetadata(result.frontmatter);
            setActiveEditorDiskState(cardPath, {
                frontmatter: result.frontmatter,
                body: getEditorBodyValue(),
            });
        } else {
            await refreshEditorAfterExternalFrontmatterChange(cardPath);
        }

        if (typeof announceSignboardStatus === 'function') {
            const count = Array.isArray(result.linkedObjects) ? result.linkedObjects.length : 0;
            announceSignboardStatus(count === 1 ? 'Linked dropped file.' : 'Linked dropped files.');
        }
        return result;
    } catch (error) {
        console.error('Unable to link dropped files.', error);
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus('Unable to link dropped files.');
        }
        return null;
    }
}

function getFilesFromCardEditorDropEvent(event) {
    const dataTransfer = event ? event.dataTransfer : null;
    if (!dataTransfer) {
        return [];
    }

    const files = dataTransfer.files ? Array.from(dataTransfer.files).filter(Boolean) : [];
    if (files.length > 0) {
        return files;
    }

    const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    return items
        .filter((item) => item && item.kind === 'file' && typeof item.getAsFile === 'function')
        .map((item) => item.getAsFile())
        .filter(Boolean);
}

function handleCardEditorDragEnter(event) {
    if (!cardEditorDragEventHasFiles(event) || !isCardEditorActive()) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    cardEditorDropDepth += 1;
    setCardEditorDropActive(true);
}

function handleCardEditorDragOver(event) {
    if (!cardEditorDragEventHasFiles(event) || !isCardEditorActive()) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
    setCardEditorDropActive(true);
}

function handleCardEditorDragLeave(event) {
    if (!cardEditorDragEventHasFiles(event)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    cardEditorDropDepth = Math.max(0, cardEditorDropDepth - 1);
    if (cardEditorDropDepth === 0) {
        setCardEditorDropActive(false);
    }
}

async function handleCardEditorDrop(event) {
    if (!cardEditorDragEventHasFiles(event) || !isCardEditorActive()) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    const files = getFilesFromCardEditorDropEvent(event);
    clearCardEditorDropState();
    await addDroppedLinkedObjectsToActiveCard(files);
}

function initializeCardEditorDropLinking(modalEditCard) {
    if (!modalEditCard) {
        return;
    }

    modalEditCard.removeEventListener('dragenter', handleCardEditorDragEnter, true);
    modalEditCard.removeEventListener('dragover', handleCardEditorDragOver, true);
    modalEditCard.removeEventListener('dragleave', handleCardEditorDragLeave, true);
    modalEditCard.removeEventListener('drop', handleCardEditorDrop, true);

    modalEditCard.addEventListener('dragenter', handleCardEditorDragEnter, true);
    modalEditCard.addEventListener('dragover', handleCardEditorDragOver, true);
    modalEditCard.addEventListener('dragleave', handleCardEditorDragLeave, true);
    modalEditCard.addEventListener('drop', handleCardEditorDrop, true);
}

function normalizeLinkedObjectUrlInput(rawUrl, { webOnly = false } = {}) {
    const rawCandidate = String(rawUrl || '').trim();
    if (!rawCandidate) {
        return '';
    }

    const hasProtocol = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawCandidate);
    const candidate = webOnly && !hasProtocol ? `https://${rawCandidate}` : rawCandidate;
    let parsedUrl = null;
    try {
        parsedUrl = new URL(candidate);
    } catch {
        return '';
    }

    const blockedProtocols = new Set(['file:', 'javascript:', 'data:']);
    if (blockedProtocols.has(parsedUrl.protocol)) {
        return '';
    }

    if (webOnly) {
        return ['http:', 'https:'].includes(parsedUrl.protocol) ? parsedUrl.href : '';
    }

    return ['http:', 'https:'].includes(parsedUrl.protocol) ? '' : parsedUrl.href;
}

function renderCardEditorLinkedObjectUrlForm(kind = 'url') {
    const popover = document.getElementById('cardEditorLinkedObjectsPopover');
    const trigger = document.getElementById('cardEditorLinkedObjectsLink');
    if (!popover) {
        return;
    }

    const isWebUrl = kind === 'url';
    popover.innerHTML = '';

    const form = document.createElement('form');
    form.id = 'cardEditorLinkedObjectUrlForm';
    form.className = 'card-editor-linked-object-url-form';
    form.noValidate = true;
    form.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    const title = document.createElement('div');
    title.className = 'card-editor-linked-object-url-title';
    title.textContent = isWebUrl ? 'Link URL' : 'Link App or Signboard URL';
    form.appendChild(title);

    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'card-editor-linked-object-url-label';
    fieldLabel.setAttribute('for', 'cardEditorLinkedObjectUrlInput');
    fieldLabel.textContent = isWebUrl ? 'URL' : 'App URL';
    form.appendChild(fieldLabel);

    const input = document.createElement('input');
    input.id = 'cardEditorLinkedObjectUrlInput';
    input.className = 'card-editor-linked-object-url-input';
    input.type = isWebUrl ? 'url' : 'text';
    input.inputMode = 'url';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = isWebUrl ? 'https://example.com/page' : 'obsidian://open?...';
    form.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'card-editor-linked-object-url-actions';

    const addButton = document.createElement('button');
    addButton.type = 'submit';
    addButton.className = 'card-editor-linked-object-url-submit';
    addButton.textContent = 'Add';
    actions.appendChild(addButton);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'card-editor-linked-object-url-cancel';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeCardEditorLinkedObjectsPopover();
        if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
        }
    });
    actions.appendChild(cancelButton);
    form.appendChild(actions);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const normalizedUrl = normalizeLinkedObjectUrlInput(input.value, { webOnly: isWebUrl });
        if (!normalizedUrl) {
            input.setAttribute('aria-invalid', 'true');
            if (typeof announceSignboardStatus === 'function') {
                announceSignboardStatus(isWebUrl ? 'Enter a valid web URL.' : 'Enter a valid app URL.');
            }
            input.focus();
            return;
        }

        input.removeAttribute('aria-invalid');
        input.disabled = true;
        addButton.disabled = true;
        cancelButton.disabled = true;

        const result = await addLinkedObjectToActiveCard({
            type: isWebUrl
                ? 'url'
                : (normalizedUrl.toLowerCase().startsWith('signboard:') ? 'signboard-link' : 'app-link'),
            url: normalizedUrl,
        });

        if (result && result.ok !== false) {
            closeCardEditorLinkedObjectsPopover();
            if (trigger && typeof trigger.focus === 'function') {
                trigger.focus();
            }
            return;
        }

        input.disabled = false;
        addButton.disabled = false;
        cancelButton.disabled = false;
        input.focus();
    });

    form.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        closeCardEditorLinkedObjectsPopover();
        if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
        }
    });

    popover.appendChild(form);
    setCardEditorOpenWithPopoverPosition(trigger, popover);
    requestAnimationFrame(() => {
        input.focus();
    });
}

function openLinkedUrlForm() {
    renderCardEditorLinkedObjectUrlForm('url');
}

function openLinkedAppUrlForm() {
    renderCardEditorLinkedObjectUrlForm('app-link');
}

async function refreshEditorAfterExternalFrontmatterChange(cardPath) {
    if (!cardPath || !window.board || typeof window.board.readCard !== 'function') {
        return;
    }

    try {
        const card = await window.board.readCard(cardPath);
        setEditorFrontmatter(card.frontmatter);
        await renderActiveEditorMetadata(card.frontmatter, card.timestamps);
        setActiveEditorDiskState(cardPath, {
            frontmatter: card.frontmatter,
            body: getEditorBodyValue(),
        });
    } catch (error) {
        console.error('Unable to refresh card metadata after external action.', error);
    }
}

async function toggleCardEditorOpenWithPopover(event) {
    event.preventDefault();
    event.stopPropagation();

    const trigger = document.getElementById('cardEditorOpenWithLink');
    const popover = document.getElementById('cardEditorOpenWithPopover');
    if (!trigger || !popover) {
        return;
    }

    if (!popover.classList.contains('hidden')) {
        closeCardEditorOpenWithPopover();
        return;
    }

    closeCardEditorLinkedObjectsPopover();

    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }
    popover.setAttribute('data-sb-modal-layer', '');
    popover.inert = false;
    popover.removeAttribute('data-sb-modal-inert');

    const linkInfo = await getActiveCardExternalLinkInfo();
    const isInObsidianVault = Boolean(linkInfo && linkInfo.inObsidianVault);

    popover.innerHTML = '';

    if (isInObsidianVault) {
        popover.appendChild(createCardEditorOpenWithAction({
            label: 'Open in Obsidian',
            icon: 'box',
            onClick: async () => {
                await runCardExternalAction(
                    (cardPath) => window.board.openCardInObsidian(cardPath),
                    'Opened card in Obsidian.',
                );
            },
        }));
    }

    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Open in Default App',
        icon: 'edit-3',
        onClick: async () => {
            await runCardExternalAction(
                (cardPath) => window.board.openCardDefault(cardPath),
                'Opened card in default app.',
            );
        },
    }));
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Reveal File',
        icon: 'folder',
        onClick: async () => {
            await runCardExternalAction(
                (cardPath) => window.board.openCard(cardPath),
                'Revealed card file.',
            );
        },
    }));

    if (isInObsidianVault) {
        appendCardEditorOpenWithSeparator(popover);

        popover.appendChild(createCardEditorOpenWithAction({
            label: 'Copy Obsidian URI',
            icon: 'copy',
            onClick: async () => {
                await runCardExternalAction(
                    (cardPath) => window.board.copyCardObsidianUri(cardPath),
                    'Copied Obsidian URI.',
                );
            },
        }));
    } else {
        appendCardEditorOpenWithSeparator(popover);
    }

    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Copy Signboard Link',
        icon: 'link',
        onClick: async () => {
            await runCardExternalAction(
                (cardPath) => window.board.copyCardSignboardUri(cardPath),
                'Copied Signboard link.',
            );
        },
    }));

    popover.classList.remove('hidden');
    popover.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    setCardEditorOpenWithPopoverPosition(trigger, popover);
    const firstAction = popover.querySelector('button');
    if (firstAction && typeof firstAction.focus === 'function') {
        firstAction.focus();
    }
}

async function toggleCardEditorLinkedObjectsPopover(event) {
    event.preventDefault();
    event.stopPropagation();

    const trigger = document.getElementById('cardEditorLinkedObjectsLink');
    const popover = document.getElementById('cardEditorLinkedObjectsPopover');
    if (!trigger || !popover) {
        return;
    }

    if (!popover.classList.contains('hidden')) {
        closeCardEditorLinkedObjectsPopover();
        return;
    }

    closeCardEditorOpenWithPopover();

    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }
    popover.setAttribute('data-sb-modal-layer', '');
    popover.inert = false;
    popover.removeAttribute('data-sb-modal-inert');

    const linkInfo = await getActiveCardExternalLinkInfo();
    const isInObsidianVault = Boolean(linkInfo && linkInfo.inObsidianVault);

    popover.innerHTML = '';
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Create Linked Obsidian Note',
        icon: 'file-plus',
        onClick: async () => {
            if (!isInObsidianVault) {
                if (typeof showObsidianVaultRequiredModal === 'function') {
                    showObsidianVaultRequiredModal({
                        message: 'Creating a linked Obsidian note only works when the current board folder is stored inside an Obsidian vault.',
                    });
                }
                return;
            }

            await createLinkedObsidianNoteForActiveCard();
        },
    }));
    appendCardEditorOpenWithSeparator(popover);
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Link Files...',
        icon: 'paperclip',
        onClick: async () => {
            await addPickedLinkedObjects('file');
        },
    }));
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Link Folder...',
        icon: 'folder',
        onClick: async () => {
            await addPickedLinkedObjects('folder');
        },
    }));
    appendCardEditorOpenWithSeparator(popover);
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Link URL...',
        icon: 'link',
        closeOnClick: false,
        onClick: openLinkedUrlForm,
    }));
    popover.appendChild(createCardEditorOpenWithAction({
        label: 'Link App or Signboard URL...',
        icon: 'external-link',
        closeOnClick: false,
        onClick: openLinkedAppUrlForm,
    }));

    popover.classList.remove('hidden');
    popover.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    setCardEditorOpenWithPopoverPosition(trigger, popover);
    const firstAction = popover.querySelector('button');
    if (firstAction && typeof firstAction.focus === 'function') {
        firstAction.focus();
    }
}

async function handleClickDuplicateCard( e ) {
    e.preventDefault();
    e.stopPropagation();
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');

    const card = await window.board.readCard(cardEditorCardPath.value);

    let currentCardName = await window.board.getCardFileName(cardEditorCardPath.value);
    let newCardName = '999' + currentCardName.slice(3,currentCardName.length).slice(0, -8) + await rand5() + '.md';

    let newCardPath = cardEditorCardPath.value.replace( currentCardName, newCardName );

    const duplicatedFrontmatterSource = {
        ...card.frontmatter,
        title: `Copy of ${card.frontmatter.title || 'Untitled'}`,
    };
    delete duplicatedFrontmatterSource.archive;
    delete duplicatedFrontmatterSource.activity;
    delete duplicatedFrontmatterSource.createdAt;

    const createdAt = new Date().toISOString();
    const copiedFrontmatter = await window.board.normalizeFrontmatter({
        ...duplicatedFrontmatterSource,
        createdAt,
        activity: [
            {
                type: 'created',
                at: createdAt,
            },
        ],
    });

    await window.board.writeCard(newCardPath, {
        frontmatter: copiedFrontmatter,
        body: card.body,
    });

    await closeAllModals(createCloseAllModalsRequest(), { rerender: true });
    await toggleEditCardModal(newCardPath);
    if (typeof announceSignboardStatus === 'function') {
        announceSignboardStatus(`Duplicated card "${copiedFrontmatter.title || 'Untitled'}".`);
    }

    return;
}
