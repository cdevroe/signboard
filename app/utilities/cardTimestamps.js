const CARD_TIMESTAMP_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const CARD_TIMESTAMP_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const CARD_TIMESTAMP_RELATIVE_FORMATTER = typeof Intl.RelativeTimeFormat === 'function'
  ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
  : null;

function getCardTimestampValue(source, key) {
  if (!source || typeof source !== 'object') {
    return '';
  }

  const timestamps = source.timestamps && typeof source.timestamps === 'object'
    ? source.timestamps
    : source;
  const value = timestamps[key];
  return value == null ? '' : String(value).trim();
}

function getCardTimestampMs(timestampValue) {
  const timestamp = String(timestampValue || '').trim();
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCardTimestampDate(timestampValue) {
  const timestampMs = getCardTimestampMs(timestampValue);
  return timestampMs > 0 ? new Date(timestampMs) : null;
}

function formatCardTimestampDate(timestampValue) {
  const date = getCardTimestampDate(timestampValue);
  return date ? CARD_TIMESTAMP_DATE_FORMATTER.format(date) : '';
}

function formatCardTimestampDateTime(timestampValue) {
  const date = getCardTimestampDate(timestampValue);
  return date ? CARD_TIMESTAMP_DATE_TIME_FORMATTER.format(date) : '';
}

function formatCardRelativeTimestamp(timestampValue) {
  const timestampMs = getCardTimestampMs(timestampValue);
  if (timestampMs <= 0) {
    return '';
  }

  if (!CARD_TIMESTAMP_RELATIVE_FORMATTER) {
    return formatCardTimestampDate(timestampValue);
  }

  const deltaSeconds = Math.round((timestampMs - Date.now()) / 1000);
  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
  ];

  for (const unit of units) {
    if (Math.abs(deltaSeconds) >= unit.seconds || unit.name === 'minute') {
      const value = Math.round(deltaSeconds / unit.seconds);
      return CARD_TIMESTAMP_RELATIVE_FORMATTER.format(value, unit.name);
    }
  }

  return CARD_TIMESTAMP_RELATIVE_FORMATTER.format(0, 'minute');
}

function createCardTimestampCellValue(timestampValue) {
  return formatCardRelativeTimestamp(timestampValue) || 'Unknown';
}

function setCardTimestampElement(element, timestampValue, formatter = formatCardTimestampDateTime) {
  if (!element) {
    return;
  }

  const timestamp = String(timestampValue || '').trim();
  const formatted = timestamp ? formatter(timestamp) : '';
  element.textContent = formatted || 'Unknown';

  if (element.tagName === 'TIME') {
    if (timestamp) {
      element.setAttribute('datetime', timestamp);
    } else {
      element.removeAttribute('datetime');
    }
  }

  const fullLabel = timestamp ? formatCardTimestampDateTime(timestamp) : '';
  if (fullLabel) {
    element.title = fullLabel;
  } else {
    element.removeAttribute('title');
  }
}
