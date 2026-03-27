async function createListElement(name, listPath, cardNames, options = {}) {
  const listEl = document.createElement('div');
  listEl.className = 'list';
  listEl.dataset.path = listPath;

  const header = document.createElement('div');
  header.className = 'list-header';
  const listName = document.createElement('span');
  listName.setAttribute('contenteditable',true);
  listName.setAttribute('data-listpath',listPath);
  listName.textContent = name.substring(4,name.length-6);

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
  actionsBtn.setAttribute('aria-label', 'List actions');
  actionsBtn.innerHTML = '<i data-feather="more-horizontal"></i>';
  actionsBtn.addEventListener('click', async function (e) {
    e.stopPropagation();
    toggleListActionsPopover({
      anchorElement: actionsBtn,
      listPath,
      listDisplayName: listName.textContent,
      cardCount: cardNames.length,
    });
  });
  header.appendChild(listName);
  header.appendChild(actionsBtn);
  listEl.appendChild(header);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'cards';
  cardsEl.dataset.path = listPath;
  listEl.appendChild(cardsEl);

  const cardElements = await Promise.all(
    cardNames.map((cardName) => createCardElement(listPath + '/' + cardName))
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

          const finalOrder = [...evt.to.querySelectorAll('.card')].map(card =>
              card.getAttribute('data-path')  // array of CURRENT filenames in final order
          );

          const allCardsInList = await window.board.listCards(evt.to.dataset.path);

          let tempFileCounter = 0;
          for (const fileName of allCardsInList) {
              await window.board.moveCard(evt.to.dataset.path + '/' + fileName, evt.to.dataset.path + '/' + fileName.replace('.md','.tmp'));
          }

          let fileCounter = 0;
          for (const filePath of finalOrder) {

              let fileNumber = (fileCounter).toLocaleString('en-US', {
                  minimumIntegerDigits: 3,
                  useGrouping: false
              });

              let adjustedFrom;

              if ( !filePath.includes( evt.to.dataset.path ) ) {
                  adjustedFrom = filePath;
              } else {
                  adjustedFrom = filePath.replace('.md','.tmp');
              }

              let adjustedTo = evt.to.dataset.path + '/' + fileNumber + await window.board.getCardFileName(filePath).slice(3).replace('.tmp','.md');

              await window.board.moveCard(adjustedFrom, adjustedTo);

              fileCounter++;

          }

          await renderBoard();
          
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
