async function createListElement(name, listPath, cardNames, options = {}) {
  const listEl = document.createElement('section');
  listEl.className = 'list';
  listEl.dataset.path = listPath;

  const header = document.createElement('div');
  header.className = 'list-header';
  const listName = document.createElement('span');
  listName.setAttribute('contenteditable',true);
  listName.setAttribute('data-listpath',listPath);
  listName.textContent = name.substring(4,name.length-6);
  listName.id = typeof createStableDomId === 'function'
    ? createStableDomId('list-name', listPath)
    : '';
  listName.setAttribute('role', 'textbox');
  listName.setAttribute('aria-label', 'List name');
  listName.setAttribute('aria-multiline', 'false');
  listName.setAttribute('spellcheck', 'false');
  listName.tabIndex = 0;
  if (listName.id) {
    listEl.setAttribute('aria-labelledby', listName.id);
  } else {
    listEl.setAttribute('aria-label', listName.textContent || 'List');
  }

  listName.addEventListener('keydown', async function (e){
      if ( e.code == 'Enter' ) { 
        e.preventDefault(); 
        
        
        return; }
  });

  listName.addEventListener('keyup', async (e) => {
    if ( e.code == 'Enter' ) { 
      e.preventDefault(); 
      
      await renameList(e);
      
      return;
    }
  });

  listName.addEventListener('focusout', async (e) => { await renameList(e) });

  const actionsBtn = document.createElement('button');
  actionsBtn.type = 'button';
  actionsBtn.className = 'list-actions-button';
  actionsBtn.title = 'List actions';
  actionsBtn.setAttribute('aria-label', `List actions for ${listName.textContent || 'list'}`);
  actionsBtn.innerHTML = '<i data-feather="more-horizontal"></i>';
  actionsBtn.addEventListener('click', async function (e) {
    e.stopPropagation();
    toggleListActionsPopover({
      anchorElement: actionsBtn,
      listPath,
      listDisplayName: listName.textContent,
      cardCount: cardsEl.querySelectorAll('.card').length,
    });
  });
  header.appendChild(listName);
  header.appendChild(actionsBtn);
  listEl.appendChild(header);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'cards';
  cardsEl.dataset.path = listPath;
  cardsEl.setAttribute('role', 'list');
  cardsEl.setAttribute('aria-label', `${listName.textContent || 'List'} cards`);
  listEl.appendChild(cardsEl);

  const cardItems = Array.isArray(cardNames) ? cardNames : [];
  const cardElements = await Promise.all(
    cardItems.map((cardItem) => {
      const cardPath = typeof getBoardSnapshotCardPath === 'function'
        ? getBoardSnapshotCardPath(listPath, cardItem)
        : `${listPath}/${cardItem}`;
      return createCardElement(cardPath, { cardRecord: cardItem });
    })
  );

  for (const cardEl of cardElements) {
    cardsEl.appendChild(cardEl);
  }

  const initializeSortable = () => {
    if (typeof Sortable !== 'function') {
      return null;
    }

    return new Sortable(cardsEl, createBoardCardSortableOptions({
      group: 'cards',
      animation: 150,
      draggable: '.card',
      disabled: isBoardLabelFilterActive(),
      onEnd: async (evt) => {
          const targetListPath = evt && evt.to ? evt.to.dataset.path : '';
          const finalOrder = [...evt.to.querySelectorAll('.card')]
            .map((card) => card.getAttribute('data-path'))
            .filter(Boolean);

          try {
            if (!window.board || typeof window.board.reorderCardsInList !== 'function') {
              throw new Error('Card reorder is unavailable.');
            }

            const result = await window.board.reorderCardsInList(targetListPath, finalOrder);
            const cardsBySourcePath = new Map(
              [...evt.to.querySelectorAll('.card[data-path]')]
                .map((card) => [card.dataset.path, card]),
            );
            for (const cardEntry of Array.isArray(result && result.cards) ? result.cards : []) {
              const cardEl = cardsBySourcePath.get(cardEntry.sourcePath);
              if (cardEl && cardEntry.cardPath) {
                if (typeof cardEl.updateSignboardPath === 'function') {
                  cardEl.updateSignboardPath(cardEntry.cardPath);
                } else {
                  cardEl.dataset.path = cardEntry.cardPath;
                }
              }
            }
            if (typeof acknowledgeLocalBoardFilesystemChanges === 'function') {
              await acknowledgeLocalBoardFilesystemChanges();
            }
          } catch (error) {
            console.error('Failed to reorder cards.', error);
            if (typeof announceSignboardStatus === 'function') {
              announceSignboardStatus('Card order could not be saved.');
            }
            await renderBoard();
          }
      }
    }));
  };

  if (options.deferSortableInit) {
    return {
      listEl,
      initializeSortable,
    };
  }

  initializeSortable();
  return listEl;
}

async function renameList( e ) {
  const currentListName = await window.board.getListDirectoryName( e.target.dataset.listpath );
  const listNameMatch = currentListName.match(/^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/);

  if (!listNameMatch) {
    return;
  }

  const sanitizedListName = sanitizeListName(e.target.textContent);
  const [, prefix, , suffix] = listNameMatch;
  const newListDirectoryName = `${prefix}${sanitizedListName}${suffix}`;

  if (newListDirectoryName === currentListName) {
    return;
  }

  const oldPath = e.target.dataset.listpath;
  const newPath = oldPath.replace(currentListName, newListDirectoryName);

  await window.board.moveList(oldPath,newPath);
  await renderBoard();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(`Renamed list to "${e.target.textContent || 'Untitled'}".`);
  }

  return;
}

function sanitizeListName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Untitled';
}
