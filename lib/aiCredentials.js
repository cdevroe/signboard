const fs = require('fs').promises;
const path = require('path');
const { atomicWriteFile } = require('./atomicFile');

const AI_CREDENTIALS_FILE_NAME = 'ai-credentials.json';
const AI_CREDENTIALS_VERSION = 1;
const CLOUD_AI_PROVIDERS = Object.freeze(['openai', 'gemini', 'anthropic']);

function normalizeCloudAiProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return CLOUD_AI_PROVIDERS.includes(provider) ? provider : '';
}

function getAiCredentialsPath(userDataPath) {
  return path.join(userDataPath, AI_CREDENTIALS_FILE_NAME);
}

async function readCredentialFile(userDataPath) {
  try {
    const raw = await fs.readFile(getAiCredentialsPath(userDataPath), 'utf8');
    const parsed = JSON.parse(raw);
    const credentials = parsed && typeof parsed.credentials === 'object' && !Array.isArray(parsed.credentials)
      ? parsed.credentials
      : {};
    return {
      version: AI_CREDENTIALS_VERSION,
      credentials,
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to read AI credentials.', error);
    }
    return {
      version: AI_CREDENTIALS_VERSION,
      credentials: {},
    };
  }
}

async function writeCredentialFile(userDataPath, data) {
  const credentialsPath = getAiCredentialsPath(userDataPath);
  await fs.mkdir(userDataPath, { recursive: true });
  await atomicWriteFile(credentialsPath, `${JSON.stringify({
    version: AI_CREDENTIALS_VERSION,
    credentials: data && data.credentials ? data.credentials : {},
  }, null, 2)}\n`, 'utf8');
  if (process.platform !== 'win32') {
    await fs.chmod(credentialsPath, 0o600).catch(() => {});
  }
}

async function setAiCredential(userDataPath, providerValue, apiKeyValue, options = {}) {
  const provider = normalizeCloudAiProvider(providerValue);
  const apiKey = String(apiKeyValue || '').trim();
  if (!provider) {
    throw new Error('Unsupported cloud AI provider.');
  }
  if (!apiKey || apiKey.length > 1000 || /[\r\n\x00]/.test(apiKey)) {
    throw new Error('Enter a valid API key.');
  }
  if (typeof options.encrypt !== 'function') {
    throw new Error('Secure credential storage is unavailable.');
  }

  const encrypted = await options.encrypt(apiKey);
  if (!encrypted) {
    throw new Error('Secure credential storage is unavailable.');
  }
  const data = await readCredentialFile(userDataPath);
  data.credentials[provider] = String(encrypted);
  await writeCredentialFile(userDataPath, data);
  return getAiCredentialStatus(userDataPath);
}

async function clearAiCredential(userDataPath, providerValue) {
  const provider = normalizeCloudAiProvider(providerValue);
  if (!provider) {
    throw new Error('Unsupported cloud AI provider.');
  }
  const data = await readCredentialFile(userDataPath);
  delete data.credentials[provider];
  await writeCredentialFile(userDataPath, data);
  return getAiCredentialStatus(userDataPath);
}

async function getAiCredential(userDataPath, providerValue, options = {}) {
  const provider = normalizeCloudAiProvider(providerValue);
  if (!provider || typeof options.decrypt !== 'function') {
    return '';
  }
  const data = await readCredentialFile(userDataPath);
  const encrypted = String(data.credentials[provider] || '');
  if (!encrypted) {
    return '';
  }
  return String(await options.decrypt(encrypted) || '').trim();
}

async function getAiCredentialStatus(userDataPath) {
  const data = await readCredentialFile(userDataPath);
  return Object.fromEntries(CLOUD_AI_PROVIDERS.map((provider) => [
    provider,
    Boolean(String(data.credentials[provider] || '').trim()),
  ]));
}

module.exports = {
  AI_CREDENTIALS_FILE_NAME,
  CLOUD_AI_PROVIDERS,
  clearAiCredential,
  getAiCredential,
  getAiCredentialStatus,
  getAiCredentialsPath,
  normalizeCloudAiProvider,
  setAiCredential,
};
