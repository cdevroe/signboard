const appSettingsSchema = require('../shared/appSettingsSchema');

const SMART_ACTION_PACKAGE_FORMAT = 'signboard-smart-action';
const SMART_ACTION_PACKAGE_VERSION = 1;
const SMART_ACTION_SHARE_BASE_URL = 'https://cdevroe.com/signboard/actions/';
const SMART_ACTION_SHARE_FRAGMENT_PREFIX = 'signboard-action-v1:';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createSmartActionPackage(scopeValue, actionValue = {}) {
  const scope = scopeValue === 'board' ? 'board' : 'card';
  const source = isObject(actionValue) ? actionValue : {};
  if (scope === 'board') {
    const mode = appSettingsSchema.normalizeSmartBoardActionMode(source.mode);
    return {
      format: SMART_ACTION_PACKAGE_FORMAT,
      version: SMART_ACTION_PACKAGE_VERSION,
      scope,
      action: {
        name: appSettingsSchema.normalizeSmartCardActionLabel(source.label, 'Shared Board Action'),
        description: appSettingsSchema.normalizeSmartBoardActionDescription(source.description),
        mode,
        capabilities: appSettingsSchema.normalizeSmartBoardActionCapabilities(source.capabilities, mode),
        prompt: appSettingsSchema.normalizeSmartBoardActionPrompt(source.prompt),
      },
    };
  }

  return {
    format: SMART_ACTION_PACKAGE_FORMAT,
    version: SMART_ACTION_PACKAGE_VERSION,
    scope,
    action: {
      name: appSettingsSchema.normalizeSmartCardActionLabel(source.label, 'Shared Card Action'),
      target: appSettingsSchema.normalizeSmartCardActionTarget(source.target || source.type),
      prompt: appSettingsSchema.normalizeSmartCardActionPrompt(source.prompt),
    },
  };
}

function normalizeSmartActionPackage(value) {
  const source = isObject(value) ? value : {};
  if (source.format !== SMART_ACTION_PACKAGE_FORMAT || Number(source.version) !== SMART_ACTION_PACKAGE_VERSION) {
    return null;
  }
  const scope = source.scope === 'board' ? 'board' : (source.scope === 'card' ? 'card' : '');
  if (!scope || !isObject(source.action)) return null;
  const normalized = createSmartActionPackage(scope, {
    label: source.action.name,
    description: source.action.description,
    mode: source.action.mode,
    capabilities: source.action.capabilities,
    target: source.action.target,
    prompt: source.action.prompt,
  });
  if (!normalized.action.name || !normalized.action.prompt) return null;
  return normalized;
}

function encodeSmartActionPackage(value) {
  const normalized = normalizeSmartActionPackage(value);
  if (!normalized) return '';
  return Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64url');
}

function decodeSmartActionPackage(value) {
  const payload = String(value || '').replace(/^#/, '').replace(new RegExp(`^${SMART_ACTION_SHARE_FRAGMENT_PREFIX}`), '');
  if (!payload || payload.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  try {
    return normalizeSmartActionPackage(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

function buildSmartActionShareUrl(scope, action) {
  const payload = encodeSmartActionPackage(createSmartActionPackage(scope, action));
  return payload ? `${SMART_ACTION_SHARE_BASE_URL}#${SMART_ACTION_SHARE_FRAGMENT_PREFIX}${payload}` : '';
}

function getSmartActionFileName(actionPackage) {
  const normalized = normalizeSmartActionPackage(actionPackage);
  if (!normalized) return 'signboard-action.signboard-action';
  const slug = normalized.action.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'signboard-action';
  return `${slug}.signboard-action`;
}

module.exports = {
  SMART_ACTION_PACKAGE_FORMAT,
  SMART_ACTION_PACKAGE_VERSION,
  SMART_ACTION_SHARE_BASE_URL,
  SMART_ACTION_SHARE_FRAGMENT_PREFIX,
  buildSmartActionShareUrl,
  createSmartActionPackage,
  decodeSmartActionPackage,
  encodeSmartActionPackage,
  getSmartActionFileName,
  normalizeSmartActionPackage,
};
