async function createCardElement(cardPath) {
  const card = await window.board.readCard(cardPath);
  const titleContent = card.frontmatter.title || '';
  let selectedLabelIds = Array.isArray(card.frontmatter.labels)
    ? card.frontmatter.labels.map((labelId) => String(labelId))
    : [];

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

  const labelButton = document.createElement('button');
  labelButton.type = 'button';
  labelButton.className = 'card-label-button';
  labelButton.title = 'Set labels';
  const labelIcon = document.createElement('i');
  labelIcon.setAttribute('data-feather', 'tag');
  labelButton.appendChild(labelIcon);
  metadata.appendChild(labelButton);

  const cardLabelsWrap = document.createElement('div');
  cardLabelsWrap.className = 'card-labels';
  metadata.appendChild(cardLabelsWrap);

  function renderCardLabels() {
    cardLabelsWrap.innerHTML = '';

    const firstKnownLabel = selectedLabelIds
      .map((labelId) => getBoardLabelById(labelId))
      .find((label) => Boolean(label));

    labelButton.style.color = firstKnownLabel ? getBoardLabelColor(firstKnownLabel) : '';

    for (const labelId of selectedLabelIds) {
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

      cardLabelsWrap.appendChild(labelChip);
    }
  }

  async function updateCardLabels(nextLabelIds) {
    selectedLabelIds = Array.isArray(nextLabelIds)
      ? nextLabelIds.map((labelId) => String(labelId))
      : [];

    card.frontmatter.labels = selectedLabelIds;
    await window.board.updateFrontmatter(cardPath, { labels: selectedLabelIds });
    renderCardLabels();

    if (isBoardLabelFilterActive() && !cardMatchesBoardLabelFilter(selectedLabelIds)) {
      await renderBoard();
    }
  }

  renderCardLabels();

  labelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    toggleCardLabelSelector(
      labelButton,
      cardPath,
      selectedLabelIds,
      async (nextLabelIds) => {
        await updateCardLabels(nextLabelIds);
      },
    );
  });

  body.appendChild(metadata);
    
  cardEl.appendChild(body);

  const matchesLabelFilter = cardMatchesBoardLabelFilter(selectedLabelIds);
  const matchesSearchFilter = cardMatchesBoardSearch(card.frontmatter.title, card.body);

  if (!matchesLabelFilter || !matchesSearchFilter) {
    cardEl.classList.add('card-filtered-out');
  }

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
