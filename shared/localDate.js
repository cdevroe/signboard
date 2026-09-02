(function initializeLocalDateHelpers(root, factory) {
  const helpers = factory();
  if (typeof window === 'undefined' && typeof module === 'object' && module.exports) {
    module.exports = helpers;
  }
  if (root) {
    root.SignboardLocalDate = helpers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalDateHelpers() {
  function normalizeDate(dateValue) {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatLocalIsoDate(dateValue = new Date()) {
    const date = normalizeDate(dateValue);
    if (!date) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseLocalIsoDate(dateValue) {
    const normalized = String(dateValue || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function getLocalDayRolloverDelay(dateValue = new Date(), bufferMs = 1000) {
    const date = normalizeDate(dateValue);
    if (!date) {
      return 0;
    }

    const nextLocalMidnight = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const normalizedBufferMs = Math.max(0, Number(bufferMs) || 0);
    return Math.max(0, nextLocalMidnight.getTime() - date.getTime()) + normalizedBufferMs;
  }

  return {
    formatLocalIsoDate,
    getLocalDayRolloverDelay,
    parseLocalIsoDate,
  };
});
