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
  const preview = document.createElement('p');
  preview.textContent = cardPreview;
  body.appendChild(preview);

  const metadata = document.createElement('div');
  metadata.className = 'metadata';

  if (card.frontmatter.due) {
    const dueWrap = document.createElement('span');
    dueWrap.className = 'due-date';
    dueWrap.title = card.frontmatter.due;

    const dueIcon = document.createElement('i');
    dueIcon.setAttribute('data-feather', 'clock');
    dueWrap.appendChild(dueIcon);
    dueWrap.append(' ');

    const formattedDue = document.createElement('span');
    formattedDue.className = 'formatted-date';
    formattedDue.textContent = await window.board.formatDueDate(card.frontmatter.due);
    dueWrap.appendChild(formattedDue);
    metadata.appendChild(dueWrap);
  }

  if (Array.isArray(card.frontmatter.labels) && card.frontmatter.labels.length > 0) {
    for (const label of card.frontmatter.labels) {
      const labelWrap = document.createElement('span');
      const labelClassSuffix = String(label).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      labelWrap.className = `label label-${labelClassSuffix}`;
      labelWrap.title = String(label);

      const labelIcon = document.createElement('i');
      labelIcon.setAttribute('data-feather', 'tag');
      labelWrap.appendChild(labelIcon);
      metadata.appendChild(labelWrap);
    }
  }

  body.appendChild(metadata);
    
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
