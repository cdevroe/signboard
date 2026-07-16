function joinBoardSnapshotPath(parentPath, entryName) {
  const parent = String(parentPath || '').replace(/[\\/]+$/, '');
  const entry = String(entryName || '').replace(/^[\\/]+/, '');
  return parent && entry ? `${parent}/${entry}` : `${parent}${entry}`;
}

function isBoardSnapshotCardRecord(cardItem) {
  return Boolean(cardItem && typeof cardItem === 'object' && !Array.isArray(cardItem));
}

function getBoardSnapshotCardName(cardItem) {
  if (typeof cardItem === 'string') {
    return cardItem;
  }

  if (isBoardSnapshotCardRecord(cardItem)) {
    const cardName = String(cardItem.cardName || '').trim();
    if (cardName) {
      return cardName;
    }

    const cardPath = String(cardItem.cardPath || '').replace(/\\/g, '/');
    return cardPath.split('/').filter(Boolean).pop() || '';
  }

  return '';
}

function getBoardSnapshotCardPath(listPath, cardItem) {
  if (isBoardSnapshotCardRecord(cardItem)) {
    const cardPath = String(cardItem.cardPath || '').trim();
    if (cardPath) {
      return cardPath;
    }
  }

  return joinBoardSnapshotPath(listPath, getBoardSnapshotCardName(cardItem));
}

function getBoardSnapshotCardData(cardItem) {
  if (!isBoardSnapshotCardRecord(cardItem)) {
    return null;
  }

  if (cardItem.frontmatter && typeof cardItem.frontmatter === 'object') {
    return cardItem;
  }

  if (cardItem.card && typeof cardItem.card === 'object') {
    return cardItem.card;
  }

  return null;
}

function normalizeBoardSnapshotList(boardRoot, listEntry) {
  if (typeof listEntry === 'string') {
    const listName = listEntry;
    return {
      listName,
      listPath: joinBoardSnapshotPath(boardRoot, listName),
      cards: [],
    };
  }

  const source = listEntry && typeof listEntry === 'object' ? listEntry : {};
  const listName = String(source.listName || source.name || '').trim();
  return {
    listName,
    listPath: String(source.listPath || source.path || joinBoardSnapshotPath(boardRoot, listName)).trim(),
    cards: Array.isArray(source.cards) ? source.cards : [],
  };
}

function normalizeBoardSnapshot(boardRoot, snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const lists = Array.isArray(source.lists)
    ? source.lists.map((listEntry) => normalizeBoardSnapshotList(boardRoot, listEntry)).filter((listEntry) => listEntry.listName)
    : [];

  return {
    ok: source.ok !== false,
    boardRoot: String(source.boardRoot || boardRoot || '').trim(),
    boardName: String(source.boardName || '').trim(),
    boardSettings: source.boardSettings && typeof source.boardSettings === 'object'
      ? source.boardSettings
      : null,
    lists,
    errors: Array.isArray(source.errors) ? source.errors : [],
  };
}

async function readBoardSnapshotForRender(boardRoot, options = {}) {
  if (window.board && typeof window.board.readBoardSnapshot === 'function') {
    try {
      const snapshot = await window.board.readBoardSnapshot(boardRoot, options);
      if (snapshot && Array.isArray(snapshot.lists)) {
        return normalizeBoardSnapshot(boardRoot, snapshot);
      }
    } catch (error) {
      console.warn('Unable to read batched board snapshot; falling back to individual reads.', error);
    }
  }

  const listNames = await window.board.listLists(boardRoot);
  const lists = await Promise.all(
    listNames.map(async (listName) => {
      const listPath = joinBoardSnapshotPath(boardRoot, listName);
      const cards = await window.board.listCards(listPath);
      return {
        listName,
        listPath,
        cards: Array.isArray(cards) ? cards : [],
      };
    }),
  );
  const [boardName, boardSettings] = await Promise.all([
    Promise.resolve().then(() => window.board.getBoardName(boardRoot)).catch(() => ''),
    options.includeBoardSettings !== false && window.board && typeof window.board.readBoardSettings === 'function'
      ? window.board.readBoardSettings(boardRoot).catch(() => null)
      : Promise.resolve(null),
  ]);

  return normalizeBoardSnapshot(boardRoot, {
    ok: true,
    boardRoot,
    boardName,
    boardSettings,
    lists,
    errors: [],
  });
}
