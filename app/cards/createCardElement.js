async function createCardElement(cardPath) {
  const card = await window.board.readCard(cardPath);
  const titleContent = card.frontmatter.title || '';

  const previewText = card.body
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '';

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.path = cardPath;

  const title = document.createElement('h3');
  title.textContent = titleContent.replace('# ', '');
  cardEl.appendChild(title);

  const body = document.createElement('div');
  body.className = 'card-body';
  const cardPreview = (previewText && previewText.length > 50) ? `${previewText.slice(0, 35)}...` : previewText;

  let cardIcons = '';

  if (card.frontmatter.due) {
    cardIcons += `<span class="due-date" title="${card.frontmatter.due}"><i data-feather="clock"></i> <span class="formatted-date">${await window.board.formatDueDate(card.frontmatter.due)}</span></span>`;
  }

  if (Array.isArray(card.frontmatter.labels) && card.frontmatter.labels.length > 0) {
    card.frontmatter.labels.forEach((label) => {
      cardIcons += `<span class="label label-${label}" title="${label}"><i data-feather="tag"></i></span>`;
    });
  }
  
  body.innerHTML = '<p>' + cardPreview + '</p>' + '<div class="metadata">' + cardIcons + '</div>';
    
  cardEl.appendChild(body);

  cardEl.addEventListener('click', async () => {

    let modalEditCard = document.getElementById('modalEditCard');
    if ( modalEditCard.style.display == 'block' ) {
      return;
    }

    toggleEditCardModal( cardPath );
  });

  // Not used yet! Drop zone for attachments
  cardEl.addEventListener('dragover', e => e.preventDefault());
  cardEl.addEventListener('drop', async e => {
    e.preventDefault();
    // const filePath = e.dataTransfer.files[0].path;
    // const dst = await window.board.copyExternal(filePath, path.dirname(cardPath));
    // const newMd = `${md}\n![${path.basename(filePath)}](${path.basename(dst)})`;
    // await window.board.writeCard(cardPath, newMd);
    // const updatedCard = await createCardElement(cardPath);
    // cardEl.parentNode.replaceChild(updatedCard, cardEl);
  });

  return cardEl;
}
