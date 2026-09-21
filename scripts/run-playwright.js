#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { isDiscoveryOnly } = require('./playwright-safety');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoots = ['app', 'bin', 'build', 'config', 'lib', 'shared', 'static', 'scripts', 'tests'];
const sourceFiles = ['package.json', 'package-lock.json', 'main.js', 'preload.js', 'index.html',
  'buildjs.sh', 'electron-builder.json', 'playwright.config.js'];
const sshOptions = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2'];

function quote(value) { return `'${String(value).replace(/'/g, "'\"'\"'")}'`; }
function remoteSettings(env = process.env) {
  const host = env.SIGNBOARD_PLAYWRIGHT_HOST || 'cdevroe@babu.local';
  const root = env.SIGNBOARD_PLAYWRIGHT_REMOTE_ROOT || '.local/share/signboard-lab/playwright';
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(host)) throw new Error('Use an SSH host name or user@host for SIGNBOARD_PLAYWRIGHT_HOST.');
  if (!/^[a-zA-Z0-9_./-]+$/.test(root) || root.startsWith('-') || root.split('/').includes('..')) {
    throw new Error('SIGNBOARD_PLAYWRIGHT_REMOTE_ROOT must be a simple absolute or home-relative path without ..');
  }
  return { host, root };
}

// Copy the actual working tree, including new source files. Never transfer a whole
// checkout: it can contain .env, signing keys, user boards, or macOS dependencies.
function stageSource(root, destination) {
  const files = [];
  const visit = (relative) => {
    const name = path.basename(relative);
    if (name.startsWith('.') || /\.(?:pem|key|p12|pfx|sb-lock|map)$/.test(name)
      || ['node_modules', 'output', 'dist'].includes(name)) return;
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) return;
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to transfer source symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(source).sort()) visit(`${relative}/${child}`);
    } else if (stat.isFile()) {
      const target = path.join(destination, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      fs.chmodSync(target, stat.mode & 0o777);
      files.push({ path: relative, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
    }
  };
  [...sourceRoots, ...sourceFiles].forEach(visit);
  const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { sha256: hash, files };
}

function run(command, args, { env = process.env, log, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'], ...options });
    // Keep stdin open for SSH. On disconnect the remote worker cancels its own children.
    child.stdout.on('data', (data) => { process.stdout.write(data); if (log) log.write(data); });
    child.stderr.on('data', (data) => { process.stderr.write(data); if (log) log.write(data); });
    const cancel = () => child.kill('SIGTERM');
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      resolve(code ?? (signal ? 130 : 1));
    });
  });
}

async function main(args) {
  const local = args[0] === '--local';
  if (local) args = args.slice(1);
  if (local || isDiscoveryOnly(args)) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (local) {
      console.log('Local Electron run: Signboard windows may take focus on this computer.');
      env.SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL = '1';
    }
    if (!isDiscoveryOnly(args)) {
      const built = await run('bash', ['buildjs.sh']);
      if (built) return built;
    }
    return run(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args], { env });
  }
  if (args.some((arg) => /^(--ui|--debug)(=|$)/.test(arg))) {
    throw new Error('Interactive debugging needs a deliberate test:playwright:local run on a suitable computer.');
  }
  const { host, root } = remoteSettings();
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const runtimeName = `sbpw-${crypto.randomBytes(6).toString('hex')}`;
  const remoteRun = `${root}/runs/${runId}`;
  const output = path.join(repoRoot, 'output/playwright/remote', runId);
  fs.mkdirSync(output, { recursive: true });
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-playwright-source-'));
  const log = fs.createWriteStream(path.join(output, 'run.log'));
  console.log(`Running Electron tests on ${host} in an isolated virtual desktop.\nResults: ${output}`);
  let uploaded = false;
  let result = 1;
  try {
    if (await run('bash', ['buildjs.sh'], { log })) throw new Error('Renderer build failed.');
    const manifest = stageSource(repoRoot, staging);
    manifest.createdAt = new Date().toISOString();
    manifest.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    manifest.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim());
    manifest.args = args;
    manifest.debug = process.env.SIGNBOARD_PLAYWRIGHT_DEBUG === '1';
    if (process.env.SIGNBOARD_SMART_LAB_CONFIG) {
      const config = process.env.SIGNBOARD_SMART_LAB_CONFIG;
      if (!/^\/[a-zA-Z0-9_./-]+$/.test(config) || config.split('/').includes('..')) throw new Error('Use an absolute remote lab config path without spaces or ..');
      manifest.smartLabConfig = config;
    }
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(path.join(staging, 'playwright-run.json'), manifestJson);
    fs.writeFileSync(path.join(output, 'source.json'), manifestJson);
    const mkdir = `mkdir -p -- ${quote(`${remoteRun}/source`)}`;
    if (await run('ssh', [...sshOptions, host, mkdir], { log })) throw new Error('Remote host unavailable. No local Electron test was started.');
    if (await run('rsync', ['-a', '-e', `ssh ${sshOptions.join(' ')}`, '--', `${staging}/`, `${host}:${remoteRun}/source/`], { log, timeout: 300_000 })) {
      throw new Error('Source transfer failed. No local Electron test was started.');
    }
    uploaded = true;
    // A transient user service owns the whole process tree, including Electron's
    // detached children. A timeout/disconnect cannot leave a browser running.
    const command = `flock -n ${quote(`${root}/runner.lock`)} systemd-run --user --quiet --wait --pipe --collect --same-dir `
      + `--unit=${quote(`signboard-playwright-${runId}`)} --property=RuntimeMaxSec=25m `
      + '--property=TimeoutStopSec=10s --property=KillMode=control-group --property=Nice=5 --property=LimitCORE=0 '
      + `--property=RuntimeDirectory=${runtimeName} --property=RuntimeDirectoryMode=0700 `
      + `node ${quote(`${remoteRun}/source/scripts/playwright-linux-worker.js`)} ${quote(remoteRun)}`;
    result = await run('ssh', [...sshOptions, host, command], { log });
  } finally {
    if (uploaded) {
      const copied = await run('rsync', ['-a', '-e', `ssh ${sshOptions.join(' ')}`, '--',
        `${host}:${remoteRun}/source/output/playwright/`, `${output}/artifacts/`], { log, timeout: 120_000 });
      if (copied) {
        console.error(`Artifact retrieval failed; remote files remain at ${host}:${remoteRun}`);
        if (result === 0) result = 1;
      }
    }
    fs.rmSync(staging, { recursive: true, force: true });
    await new Promise((resolve) => log.end(resolve));
  }
  console.log(`Remote run ${result === 0 ? 'passed' : `exited with status ${result}`}. Results: ${output}`);
  return result;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; })
  .catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { stageSource, remoteSettings, quote };
