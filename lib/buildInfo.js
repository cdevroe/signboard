const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function getBuildInfo(appRoot = root) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(path.join(appRoot, 'config/build-info.json'), 'utf8')); } catch {}
  let version = saved?.version || 'unknown';
  try { version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const valid = saved?.schemaVersion === 1 && saved.version === version
    && /^\d{8}\.[1-9]\d*$/.test(saved.buildId) && ['development', 'release'].includes(saved.channel)
    && /^[a-f0-9]{64}$/.test(saved.sourceFingerprint) && Number.isFinite(Date.parse(saved.builtAt));
  // Source checkouts must not claim a stamped identity after local edits.
  let current = valid;
  const sourceHelper = path.join(appRoot, 'scripts/buildIdentity.js');
  if (current && fs.existsSync(sourceHelper)) {
    current = require(sourceHelper).sourceFingerprint(appRoot).hash === saved.sourceFingerprint;
  }
  return current ? {
    version, buildId: saved.buildId, channel: saved.channel, builtAt: saved.builtAt,
    sourceFingerprint: saved.sourceFingerprint, commit: saved.commit || '', dirty: saved.dirty === true,
  } : { version, buildId: null, channel: 'source', builtAt: null, sourceFingerprint: null, commit: '', dirty: false };
}

function formatBuildInfo(info = getBuildInfo()) {
  const channel = info.channel === 'release' ? 'Release' : 'Development';
  return info.buildId ? `Signboard ${info.version} · ${channel} build ${info.buildId}` : `Signboard ${info.version} · Unstamped source build`;
}
function buildInfoDetails(info = getBuildInfo()) {
  return [formatBuildInfo(info), ...(info.buildId ? [
    `Built: ${info.builtAt}`, `Source: ${info.sourceFingerprint}`,
    ...(info.commit ? [`Commit: ${info.commit}${info.dirty ? ' (working-tree changes)' : ''}`] : []),
  ] : [])].join('\n');
}
module.exports = { getBuildInfo, formatBuildInfo, buildInfoDetails };
