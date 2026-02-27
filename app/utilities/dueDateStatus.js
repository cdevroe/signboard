const DUE_DATE_VISUAL_CLASSES = Object.freeze([
  'due-date-today',
  'due-date-tomorrow',
]);

function parseIsoDateStringToLocalDate(dateValue) {
  const normalized = String(dateValue || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  const parsedDate = new Date(year, monthIndex, day);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== monthIndex ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function getDueDateVisualClass(dueDateValue) {
  const dueDate = parseIsoDateStringToLocalDate(dueDateValue);
  if (!dueDate) {
    return '';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (dueDate.getTime() === today.getTime()) {
    return 'due-date-today';
  }

  if (dueDate.getTime() === tomorrow.getTime()) {
    return 'due-date-tomorrow';
  }

  return '';
}

function setDueDateVisualClass(element, dueDateValue) {
  if (!(element instanceof Element)) {
    return '';
  }

  for (const className of DUE_DATE_VISUAL_CLASSES) {
    element.classList.remove(className);
  }

  const visualClass = getDueDateVisualClass(dueDateValue);
  if (visualClass) {
    element.classList.add(visualClass);
  }

  return visualClass;
}
