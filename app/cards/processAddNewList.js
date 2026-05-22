function normalizeBoardRootPath(boardRoot) {
    const normalizedRoot = String(boardRoot || '').replace(/\\/g, '/').trim();
    if (!normalizedRoot) {
        return '';
    }

    return normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
}

function getListDirectoryNameFromPath(listPath) {
    const normalizedPath = String(listPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalizedPath) {
        return '';
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
}

function compareListDirectoryNames(left, right) {
    return String(left || '').localeCompare(String(right || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
        ignorePunctuation: true,
    });
}

function formatListIndex(index) {
    return Number(index || 0).toLocaleString('en-US', {
        minimumIntegerDigits: 3,
        useGrouping: false,
    });
}

function buildReindexedListDirectoryName(directoryName, index) {
    const suffixMatch = String(directoryName || '').match(/^\d{3}(.*)$/);
    const suffix = suffixMatch ? suffixMatch[1] : `-${String(directoryName || '').replace(/^\d+-?/, '')}`;
    return `${formatListIndex(index)}${suffix}`;
}

async function reorderBoardLists(boardRoot, orderedDirectoryNames) {
    const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
    const names = Array.isArray(orderedDirectoryNames)
        ? orderedDirectoryNames.filter(Boolean)
        : [];

    if (!normalizedBoardRoot || names.length === 0) {
        return;
    }

    const temporaryEntries = [];
    for (const [index, directoryName] of names.entries()) {
        const tempDirectoryName = `__sbtmp-${formatListIndex(index)}-${await rand5()}`;
        await window.board.moveList(
            `${normalizedBoardRoot}${directoryName}`,
            `${normalizedBoardRoot}${tempDirectoryName}`,
        );
        temporaryEntries.push({ directoryName, tempDirectoryName });
    }

    for (const [index, entry] of temporaryEntries.entries()) {
        await window.board.moveList(
            `${normalizedBoardRoot}${entry.tempDirectoryName}`,
            `${normalizedBoardRoot}${buildReindexedListDirectoryName(entry.directoryName, index)}`,
        );
    }
}

function getAddListModalCoordinates(anchorElement) {
    const viewportPadding = 8;
    const modalWidth = Math.min(360, Math.max(240, window.innerWidth - (viewportPadding * 2)));

    if (!(anchorElement instanceof Element)) {
        return {
            left: Math.round((window.innerWidth / 2) - 200),
            top: Math.round((window.innerHeight / 2) - 100),
        };
    }

    const bounds = anchorElement.getBoundingClientRect();
    const preferredLeft = bounds.left + (bounds.width / 2) - (modalWidth / 2);
    const clampedLeft = Math.min(
        window.innerWidth - modalWidth - viewportPadding,
        Math.max(viewportPadding, preferredLeft),
    );

    return {
        left: Math.round(clampedLeft + window.scrollX),
        top: Math.round(bounds.bottom + 15 + window.scrollY),
    };
}

function openAddListModal(options = {}) {
    const anchorElement = options.anchorElement instanceof Element ? options.anchorElement : null;
    const afterListPath = typeof options.afterListPath === 'string' ? options.afterListPath : '';
    const listNameInput = document.getElementById('userInputListName');
    const addListButton = document.getElementById('btnAddList');

    if (!listNameInput || !addListButton) {
        return;
    }

    if (typeof closeListActionsPopover === 'function') {
        closeListActionsPopover();
    }

    const { left, top } = getAddListModalCoordinates(anchorElement);
    toggleAddListModal(left, top);
    listNameInput.focus();
    listNameInput.select();

    addListButton.onclick = async (event) => {
        event.stopPropagation();

        if (listNameInput.value.length < 3) {
            return;
        }

        await processAddNewList(listNameInput.value, { afterListPath });
        listNameInput.value = '';
    };

    listNameInput.onkeydown = (key) => {
        if (key.code !== 'Enter') {
            return;
        }

        key.preventDefault();
        addListButton.click();
    };
}

async function processAddNewList(listName, options = {}){
    const normalizedBoardRoot = normalizeBoardRootPath(window.boardRoot);
    if (!normalizedBoardRoot) {
        return;
    }

    const currentLists = (await window.board.listLists(normalizedBoardRoot))
        .filter(Boolean)
        .sort(compareListDirectoryNames);
    const countLists = currentLists.length;
    const requestedAfterListDirectoryName = getListDirectoryNameFromPath(options.afterListPath);

    const afterListIndex = requestedAfterListDirectoryName
        ? currentLists.findIndex((entry) => entry === requestedAfterListDirectoryName)
        : -1;
    const insertionIndex = afterListIndex >= 0
        ? afterListIndex + 1
        : countLists;

    const nextListNumber = formatListIndex(countLists);
    const userCreatedListName = await sanitizeFileName(listName.slice(0,25) + '-' + await rand5());
    const createdDirectoryName = `${nextListNumber}-${userCreatedListName}`;

    await window.board.createList(`${normalizedBoardRoot}${createdDirectoryName}`);

    if (afterListIndex >= 0 && insertionIndex < countLists) {
        const reorderedLists = [
            ...currentLists.slice(0, insertionIndex),
            createdDirectoryName,
            ...currentLists.slice(insertionIndex),
        ];
        await reorderBoardLists(normalizedBoardRoot, reorderedLists);
    }
    
    await closeAllModals(createCloseAllModalsRequest(), { rerender: true });
    if (typeof announceSignboardStatus === 'function') {
        announceSignboardStatus(`Created list "${listName}".`);
    }
    return;
}
