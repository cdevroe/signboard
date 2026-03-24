const fs = require('fs').promises;
const {
  addWarning,
  appendSections,
  buildMarkdownSection,
  buildMetadataBody,
  createCard,
  createImportContext,
  createList,
  ensureLabel,
  getTrelloLabelColors,
  normalizeIsoDateFromValue,
  persistLabels,
} = require('./shared');

function sortByPosition(left, right) {
  return (Number(left?.pos) || 0) - (Number(right?.pos) || 0);
}

function buildChecklistSection(checklists = []) {
  const sections = [];

  for (const checklist of checklists) {
    const items = Array.isArray(checklist.checkItems) ? [...checklist.checkItems].sort(sortByPosition) : [];
    if (items.length === 0) {
      continue;
    }

    const lines = items.map((item) => {
      const due = normalizeIsoDateFromValue(item.due);
      const checkbox = item.state === 'complete' ? '[x]' : '[ ]';
      const duePrefix = due ? `(due: ${due}) ` : '';
      return `- ${checkbox} ${duePrefix}${String(item.name || '').trim() || 'Untitled task'}`;
    });

    sections.push(buildMarkdownSection(String(checklist.name || 'Checklist').trim() || 'Checklist', lines.join('\n')));
  }

  return sections;
}

function buildCommentsSection(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return '';
  }

  const lines = [];
  const sorted = [...actions].sort((left, right) => {
    return String(left?.date || '').localeCompare(String(right?.date || ''));
  });

  for (const action of sorted) {
    const text = String(action?.data?.text || '').trim();
    if (!text) {
      continue;
    }

    const author = String(action?.memberCreator?.fullName || action?.memberCreator?.username || 'Unknown').trim();
    const date = String(action?.date || '').trim();
    lines.push(`- ${date}${author ? ` by ${author}` : ''}`);
    lines.push(`  ${text.replace(/\n/g, '\n  ')}`);
  }

  return lines.length > 0 ? buildMarkdownSection('Imported comments', lines.join('\n')) : '';
}

function buildAttachmentsSection(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '';
  }

  const lines = attachments.map((attachment) => {
    const name = String(attachment?.name || attachment?.fileName || 'Attachment').trim() || 'Attachment';
    const url = String(attachment?.url || '').trim();
    const details = [];
    if (attachment?.mimeType) {
      details.push(String(attachment.mimeType));
    }
    if (Number.isFinite(attachment?.bytes)) {
      details.push(`${attachment.bytes} bytes`);
    }

    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    return url ? `- [${name}](${url})${suffix}` : `- ${name}${suffix}`;
  });

  return buildMarkdownSection('Imported attachments', lines.join('\n'));
}

function buildMetadataSection(board, list, card, members = []) {
  const metadata = {
    Source: 'Trello',
    'Trello board': board?.name || '',
    'Trello board URL': board?.url || board?.shortUrl || '',
    'Original Trello list': list?.name || 'Unknown list',
    'Trello card URL': card?.url || card?.shortUrl || '',
    'Trello card ID': card?.id || '',
    'Trello card short ID': card?.idShort != null ? String(card.idShort) : '',
    'Trello short link': card?.shortLink || '',
    'Closed in Trello': card?.closed === true || list?.closed === true ? 'Yes' : '',
    'Template': card?.isTemplate === true ? 'Yes' : '',
    Start: card?.start || '',
    'Due timestamp': card?.due || '',
    'Due complete': card?.dueComplete === true ? 'Yes' : '',
    'Due reminder': card?.dueReminder != null ? String(card.dueReminder) : '',
    Members: members,
    'Last activity': card?.dateLastActivity || '',
  };

  return buildMarkdownSection('Imported metadata', buildMetadataBody(metadata));
}

function getUsedTrelloLabelIds(cards = []) {
  const used = new Set();
  for (const card of cards) {
    const labelIds = Array.isArray(card?.idLabels) ? card.idLabels : [];
    for (const labelId of labelIds) {
      if (labelId) {
        used.add(String(labelId));
      }
    }
  }
  return used;
}

function resolveCardMembers(card, memberMap) {
  const ids = Array.isArray(card?.idMembers) ? card.idMembers : [];
  const names = [];
  for (const id of ids) {
    const member = memberMap.get(String(id));
    if (!member) {
      continue;
    }

    const display = String(member.fullName || member.username || member.id || '').trim();
    if (display) {
      names.push(display);
    }
  }

  return names;
}

async function buildLabelIdMap(context, data) {
  const labelIdMap = new Map();
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const usedLabelIds = getUsedTrelloLabelIds(cards);
  const labels = Array.isArray(data.labels) ? data.labels : [];

  for (const label of labels) {
    const rawName = String(label?.name || '').trim();
    if (!rawName && !usedLabelIds.has(String(label?.id || ''))) {
      continue;
    }

    const name = rawName || `Trello ${String(label?.color || 'Label').trim().replace(/^./, (char) => char.toUpperCase())}`;
    const labelId = await ensureLabel(context, name, getTrelloLabelColors(label?.color, labelIdMap.size));
    if (labelId) {
      labelIdMap.set(String(label.id || ''), labelId);
    }
  }

  await persistLabels(context);
  return labelIdMap;
}

async function importTrello(options = {}) {
  const sourcePath = String(options.sourcePath || '').trim();
  if (!sourcePath) {
    throw new Error('Trello import source path is required.');
  }

  const raw = await fs.readFile(sourcePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Trello JSON export: ${error?.message || error}`);
  }

  if (!data || !Array.isArray(data.cards) || !Array.isArray(data.lists)) {
    throw new Error('Invalid Trello export. Expected board JSON with cards and lists arrays.');
  }

  const context = await createImportContext(options.boardRoot, 'trello', [sourcePath]);
  const labelIdMap = await buildLabelIdMap(context, data);
  const memberMap = new Map((Array.isArray(data.members) ? data.members : []).map((member) => [String(member.id || ''), member]));
  const listEntries = [...data.lists].sort(sortByPosition);
  const listById = new Map(listEntries.map((list) => [String(list.id || ''), list]));
  const checklistMap = new Map();
  const actionMap = new Map();
  const createdOpenLists = new Map();

  if (Array.isArray(data.checklists)) {
    for (const checklist of data.checklists) {
      const key = String(checklist?.idCard || '');
      if (!key) {
        continue;
      }

      if (!checklistMap.has(key)) {
        checklistMap.set(key, []);
      }
      checklistMap.get(key).push(checklist);
    }
  }

  if (Array.isArray(data.actions)) {
    if (data.actions.length >= 1000) {
      addWarning(context, 'This Trello export includes 1000 actions, so older comments/history may be missing.');
    }

    for (const action of data.actions) {
      if (action?.type !== 'commentCard') {
        continue;
      }

      const cardId = String(action?.data?.idCard || '');
      if (!cardId) {
        continue;
      }

      if (!actionMap.has(cardId)) {
        actionMap.set(cardId, []);
      }
      actionMap.get(cardId).push(action);
    }
  }

  for (const list of listEntries) {
    if (list?.closed === true) {
      continue;
    }

    const created = await createList(context, list?.name || 'Untitled');
    createdOpenLists.set(String(list.id || ''), created);
  }

  const sortedCards = [...data.cards].sort((left, right) => {
    const leftList = listById.get(String(left?.idList || ''));
    const rightList = listById.get(String(right?.idList || ''));
    const listDelta = sortByPosition(leftList, rightList);
    if (listDelta !== 0) {
      return listDelta;
    }

    return sortByPosition(left, right);
  });

  for (const card of sortedCards) {
    const sourceList = listById.get(String(card?.idList || '')) || null;
    const isArchived = card?.closed === true || sourceList?.closed === true;
    const targetList = isArchived
      ? null
      : createdOpenLists.get(String(card?.idList || ''));
    const cardLabelIds = Array.isArray(card?.idLabels)
      ? card.idLabels.map((id) => labelIdMap.get(String(id || ''))).filter(Boolean)
      : [];
    const cardMembers = resolveCardMembers(card, memberMap);
    const body = appendSections(String(card?.desc || '').trim(), [
      ...buildChecklistSection(checklistMap.get(String(card?.id || '')) || []),
      buildCommentsSection(actionMap.get(String(card?.id || '')) || []),
      buildAttachmentsSection(card?.attachments || []),
      buildMetadataSection(data, sourceList, card, cardMembers),
    ]);

    await createCard(context, targetList, {
      title: card?.name || 'Untitled',
      due: normalizeIsoDateFromValue(card?.due),
      labels: cardLabelIds,
      body,
    });
  }

  await persistLabels(context);
  return context.summary;
}

module.exports = {
  importTrello,
};
