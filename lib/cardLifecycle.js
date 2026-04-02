function trimStringValue(value) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatActivityTimestamp(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function getListDisplayName(directoryName) {
  const normalized = trimStringValue(directoryName);
  if (!normalized) {
    return '';
  }

  if (normalized === 'XXX-Archive') {
    return 'Archive';
  }

  const structuredMatch = normalized.match(/^\d{3}-(.*?)(?:-[^-]{5}|-stock)$/);
  if (structuredMatch && structuredMatch[1]) {
    return structuredMatch[1];
  }

  return normalized.replace(/^\d+-/, '');
}

function cleanActivityDetailEntries(details = {}) {
  const source = isObject(details) ? details : {};
  const cleaned = {};

  for (const [key, value] of Object.entries(source)) {
    if (value == null) {
      continue;
    }

    const trimmed = trimStringValue(value);
    if (!trimmed) {
      continue;
    }

    cleaned[key] = trimmed;
  }

  return cleaned;
}

function normalizeCardActivityEntries(entries) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .filter((entry) => isObject(entry))
    .map((entry) => {
      const type = trimStringValue(entry.type);
      if (!type) {
        return null;
      }

      const normalized = {
        type,
      };

      const at = trimStringValue(entry.at);
      if (at) {
        normalized.at = at;
      }

      for (const [key, value] of Object.entries(cleanActivityDetailEntries(entry))) {
        if (key === 'type' || key === 'at') {
          continue;
        }

        normalized[key] = value;
      }

      return normalized;
    })
    .filter(Boolean);
}

function cloneFrontmatter(frontmatter = {}) {
  return isObject(frontmatter) ? { ...frontmatter } : {};
}

function appendCardActivity(frontmatter, type, details = {}, options = {}) {
  const normalizedType = trimStringValue(type);
  if (!normalizedType) {
    return cloneFrontmatter(frontmatter);
  }

  const nextFrontmatter = cloneFrontmatter(frontmatter);
  const activityEntries = normalizeCardActivityEntries(nextFrontmatter.activity);
  const nextEntry = {
    type: normalizedType,
    at: trimStringValue(options.at) || formatActivityTimestamp(),
    ...cleanActivityDetailEntries(details),
  };

  activityEntries.push(nextEntry);
  nextFrontmatter.activity = activityEntries;
  return nextFrontmatter;
}

function stripCardLifecycleFields(frontmatter = {}) {
  const nextFrontmatter = cloneFrontmatter(frontmatter);
  delete nextFrontmatter.archive;
  delete nextFrontmatter.activity;
  delete nextFrontmatter.createdAt;
  return nextFrontmatter;
}

function prepareNewCardFrontmatter(frontmatter = {}, options = {}) {
  const createdAt = trimStringValue(options.createdAt) || formatActivityTimestamp();
  let nextFrontmatter = stripCardLifecycleFields(frontmatter);
  nextFrontmatter.createdAt = createdAt;
  nextFrontmatter = appendCardActivity(nextFrontmatter, 'created', options.activityDetails, { at: createdAt });
  return nextFrontmatter;
}

function setCardArchiveState(frontmatter = {}, options = {}) {
  const archivedAt = trimStringValue(options.archivedAt) || formatActivityTimestamp();
  const archiveContainerType = trimStringValue(options.archiveContainerType) || 'standalone-card';
  const originalListDirectoryName = trimStringValue(options.originalListDirectoryName);
  const originalListDisplayName = trimStringValue(options.originalListDisplayName)
    || getListDisplayName(originalListDirectoryName)
    || 'Unknown original list';

  let nextFrontmatter = cloneFrontmatter(frontmatter);
  nextFrontmatter.archive = {
    archivedAt,
    originalListDirectoryName,
    originalListDisplayName,
    archiveContainerType,
  };

  nextFrontmatter = appendCardActivity(nextFrontmatter, 'archived', {
    originalListDirectoryName,
    originalListDisplayName,
    archiveContainerType,
  }, {
    at: archivedAt,
  });

  return nextFrontmatter;
}

function clearCardArchiveState(frontmatter = {}, options = {}) {
  const restoredAt = trimStringValue(options.restoredAt) || formatActivityTimestamp();
  const toListDirectoryName = trimStringValue(options.toListDirectoryName);
  const toListDisplayName = trimStringValue(options.toListDisplayName) || getListDisplayName(toListDirectoryName);

  const nextFrontmatter = cloneFrontmatter(frontmatter);
  delete nextFrontmatter.archive;

  return appendCardActivity(nextFrontmatter, 'restored', {
    toListDirectoryName,
    toListDisplayName,
  }, {
    at: restoredAt,
  });
}

function recordCardListMove(frontmatter = {}, options = {}) {
  const fromListDirectoryName = trimStringValue(options.fromListDirectoryName);
  const toListDirectoryName = trimStringValue(options.toListDirectoryName);
  if (!fromListDirectoryName || !toListDirectoryName || fromListDirectoryName === toListDirectoryName) {
    return cloneFrontmatter(frontmatter);
  }

  const movedAt = trimStringValue(options.movedAt) || formatActivityTimestamp();
  return appendCardActivity(frontmatter, 'moved-list', {
    fromListDirectoryName,
    fromListDisplayName: trimStringValue(options.fromListDisplayName) || getListDisplayName(fromListDirectoryName),
    toListDirectoryName,
    toListDisplayName: trimStringValue(options.toListDisplayName) || getListDisplayName(toListDirectoryName),
  }, {
    at: movedAt,
  });
}

module.exports = {
  appendCardActivity,
  clearCardArchiveState,
  formatActivityTimestamp,
  getListDisplayName,
  normalizeCardActivityEntries,
  prepareNewCardFrontmatter,
  recordCardListMove,
  setCardArchiveState,
  stripCardLifecycleFields,
};
