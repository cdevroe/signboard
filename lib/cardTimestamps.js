const fs = require('fs').promises;
const cardFrontmatter = require('./cardFrontmatter');

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTimestamp(value) {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return '';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  const asString = String(value).trim();
  if (!asString) {
    return '';
  }

  const date = new Date(asString);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getStatsTimestamp(stats, fields) {
  if (!stats || !Array.isArray(fields)) {
    return '';
  }

  for (const field of fields) {
    if (!field) {
      continue;
    }

    const timestamp = normalizeTimestamp(stats[field]);
    if (timestamp) {
      return timestamp;
    }
  }

  return '';
}

function getCreatedActivityTimestamp(frontmatter) {
  const entries = Array.isArray(frontmatter && frontmatter.activity)
    ? frontmatter.activity
    : [];

  for (const entry of entries) {
    if (!isObject(entry) || String(entry.type || '').trim() !== 'created') {
      continue;
    }

    const timestamp = normalizeTimestamp(entry.at);
    if (timestamp) {
      return timestamp;
    }
  }

  return '';
}

function resolveCardTimestamps(frontmatter = {}, stats = null) {
  const normalizedFrontmatter = isObject(frontmatter) ? frontmatter : {};
  const explicitCreatedAt = normalizeTimestamp(normalizedFrontmatter.createdAt);
  const activityCreatedAt = getCreatedActivityTimestamp(normalizedFrontmatter);
  const fileCreatedAt = getStatsTimestamp(stats, ['birthtime', 'ctime', 'mtime']);
  const updatedAt = getStatsTimestamp(stats, ['mtime', 'ctime']);

  return {
    createdAt: explicitCreatedAt || activityCreatedAt || fileCreatedAt,
    updatedAt,
    createdAtSource: explicitCreatedAt
      ? 'frontmatter'
      : (activityCreatedAt ? 'activity' : (fileCreatedAt ? 'filesystem' : '')),
    updatedAtSource: updatedAt ? 'filesystem' : '',
  };
}

async function readCardWithTimestamps(filePath) {
  const [card, stats] = await Promise.all([
    cardFrontmatter.readCard(filePath),
    fs.stat(filePath),
  ]);

  return {
    ...card,
    timestamps: resolveCardTimestamps(card.frontmatter, stats),
  };
}

module.exports = {
  normalizeTimestamp,
  readCardWithTimestamps,
  resolveCardTimestamps,
};
