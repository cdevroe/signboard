function getLinkedObjectUtilityStringList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function getLinkedObjectUtilityWikiTarget(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^!?\[\[([^\]]+)\]\]$/);
  if (!match) {
    return '';
  }

  const inner = String(match[1] || '').trim();
  const pipeIndex = inner.indexOf('|');
  const targetWithAnchor = (pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner).trim();
  const target = targetWithAnchor.split('#')[0].replace(/\\/g, '/').replace(/^\/+/, '').trim();
  return target || raw;
}

function getLinkedObjectUtilityUrlKey(value) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    return '';
  }

  try {
    const parsedUrl = new URL(candidate);
    return ['http:', 'https:'].includes(parsedUrl.protocol)
      ? `url:${parsedUrl.href}`
      : '';
  } catch {
    return '';
  }
}

function getLinkedObjectUtilityStructuredKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  const type = String(value.type || '').trim();
  if (!type) {
    return '';
  }

  if (type === 'file' || type === 'folder') {
    const targetPath = String(value.path || '').trim();
    return targetPath ? `${type}:${targetPath}` : '';
  }

  if (type === 'url') {
    return getLinkedObjectUtilityUrlKey(value.url) || `url:${String(value.url || '').trim()}`;
  }

  if (type === 'app-link' || type === 'signboard-link') {
    const targetUrl = String(value.url || value.target || '').trim();
    return targetUrl ? `${type}:${targetUrl}` : '';
  }

  if (type === 'obsidian-note') {
    const notePath = String(value.path || '').trim();
    const target = String(value.target || value.raw || '').trim();
    return notePath
      ? `obsidian-note:${notePath}`
      : (target ? `obsidian-target:${target}` : '');
  }

  const fallbackTarget = String(value.target || value.url || value.path || value.title || '').trim();
  return fallbackTarget ? `${type}:${fallbackTarget}` : '';
}

function getFrontmatterLinkedObjectCount(frontmatter = {}) {
  const metadata = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  const seen = new Set();
  let count = 0;

  const addObjectKey = (key, aliases = []) => {
    const normalizedKey = String(key || '').trim();
    const normalizedAliases = (Array.isArray(aliases) ? aliases : [])
      .map((alias) => String(alias || '').trim())
      .filter(Boolean);
    const allKeys = [normalizedKey, ...normalizedAliases].filter(Boolean);
    if (allKeys.length === 0 || allKeys.some((candidateKey) => seen.has(candidateKey))) {
      return;
    }

    for (const candidateKey of allKeys) {
      seen.add(candidateKey);
    }
    count += 1;
  };

  const structuredObjects = Array.isArray(metadata.linked_objects) ? metadata.linked_objects : [];
  for (const linkedObject of structuredObjects) {
    const key = getLinkedObjectUtilityStructuredKey(linkedObject);
    const aliases = [];

    if (linkedObject && typeof linkedObject === 'object' && !Array.isArray(linkedObject)) {
      const type = String(linkedObject.type || '').trim();
      const target = String(linkedObject.target || linkedObject.raw || '').trim();
      if (type === 'obsidian-note' && target) {
        aliases.push(`obsidian-target:${target}`);
      }
    }

    addObjectKey(key, aliases);
  }

  for (const relatedValue of getLinkedObjectUtilityStringList(metadata.related)) {
    const wikiTarget = getLinkedObjectUtilityWikiTarget(relatedValue);
    if (wikiTarget) {
      addObjectKey(`obsidian-target:${relatedValue}`);
      continue;
    }

    addObjectKey(getLinkedObjectUtilityUrlKey(relatedValue));
  }

  return count;
}

function getLinkedObjectCountLabel(count) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  return `${normalizedCount} linked object${normalizedCount === 1 ? '' : 's'}`;
}

function createLinkedObjectsMetadataBadge(count, className = '') {
  const normalizedCount = Math.max(0, Number(count) || 0);
  if (normalizedCount <= 0 || typeof document === 'undefined') {
    return null;
  }

  const badge = document.createElement('span');
  badge.className = `linked-objects-badge ${className}`.trim();
  const label = getLinkedObjectCountLabel(normalizedCount);
  badge.title = label;
  badge.setAttribute('aria-label', label);
  badge.setAttribute('data-sb-tooltip', label);

  const icon = document.createElement('span');
  icon.className = 'linked-objects-badge-icon';
  icon.setAttribute('aria-hidden', 'true');
  const featherSource = typeof window !== 'undefined' && window.feather
    ? window.feather
    : (typeof feather !== 'undefined' ? feather : null);
  if (featherSource && featherSource.icons && featherSource.icons.paperclip) {
    icon.innerHTML = featherSource.icons.paperclip.toSvg();
  }
  badge.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'linked-objects-badge-text';
  text.textContent = String(normalizedCount);
  badge.appendChild(text);

  return badge;
}
