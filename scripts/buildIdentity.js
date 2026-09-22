const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { atomicWriteFile } = require('../lib/atomicFile');
const { withFileTransaction } = require('../lib/fileTransaction');

// Content and relative filenames, never mtimes, absolute paths, secrets, or host data.
const SOURCE_ROOTS = ['app', 'bin', 'config', 'lib', 'shared', 'static', 'build', 'scripts'];
const SOURCE_FILES = ['package.json', 'package-lock.json', 'main.js', 'preload.js', 'index.html', 'buildjs.sh', 'electron-builder.json'];
function sourceFingerprint(root) {
  const files = [];
  const visit = (relative) => {
    if (relative === 'config/build-info.json' || /(?:\.sb-lock(?:\.reap)?|\.map)$/.test(relative) || path.basename(relative) === '.DS_Store') return;
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Build sources must not contain symlinks: ${relative}`);
    if (stat.isDirectory()) for (const child of fs.readdirSync(file)) visit(`${relative}/${child}`);
    else if (stat.isFile()) files.push(relative);
  };
  [...SOURCE_ROOTS, ...SOURCE_FILES].forEach(visit);
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    let bytes = fs.readFileSync(path.join(root, file));
    // Git may check text out with CRLF on Windows; identity is platform independent.
    if (/\.(?:[cm]?js|json|html|css|sh|md|ya?ml|desktop|plist|svg|txt)$/.test(file)) {
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    }
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return { hash: hash.digest('hex'), fileCount: files.length };
}
function readStamp(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'config/build-info.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function validateStamp(root) {
  const saved = readStamp(root);
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!saved || saved.schemaVersion !== 1 || saved.version !== version
    || !/^\d{8}\.[1-9]\d*$/.test(saved.buildId) || !['development', 'release'].includes(saved.channel)
    || !Number.isFinite(Date.parse(saved.builtAt)) || saved.sourceFingerprint !== sourceFingerprint(root).hash) {
    throw new Error('Build identity is missing or stale. Run npm run build:stamp, then share that complete snapshot (including config/build-info.json) with every platform builder.');
  }
  return saved;
}
async function stampBuild(root, { channel = 'development', now = new Date(), newBuild = false } = {}) {
  if (!['development', 'release'].includes(channel)) throw new Error('Channel must be development or release.');
  const file = path.join(root, 'config/build-info.json');
  return withFileTransaction(file, async () => {
    const previous = readStamp(root);
    const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const source = sourceFingerprint(root);
    if (!newBuild && previous?.sourceFingerprint === source.hash && previous.version === version && previous.channel === channel) return validateStamp(root);
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = previous?.buildId?.startsWith(`${date}.`) ? Number(previous.buildId.split('.')[1]) + 1 : 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid previous build sequence.');
    let commit = ''; let dirty = false;
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    } catch { /* Transferred source trees can stamp, but normally reuse the origin stamp. */ }
    const stamp = { schemaVersion: 1, version, buildId: `${date}.${sequence}`, channel, builtAt: now.toISOString(),
      sourceFingerprint: source.hash, sourceFileCount: source.fileCount, commit, dirty };
    await atomicWriteFile(file, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
    return stamp;
  });
}
module.exports = { sourceFingerprint, readStamp, validateStamp, stampBuild };
