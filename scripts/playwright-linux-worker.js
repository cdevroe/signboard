#!/usr/bin/env node
// Runs only on the Linux test host, under the remote runner's lock and deadline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const runRoot = path.resolve(process.argv[2]);
const source = path.join(runRoot, 'source');
const lab = path.resolve(runRoot, '../..');
const toolsRoot = path.join(lab, 'tools/root/usr');
const desktopMode = process.argv[3] === '--desktop';
const children = new Set();
let interrupted = false;
let temporaryRoot;

function stopChildren() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
  }
}
function cancel() {
  interrupted = true;
  stopChildren();
}
process.on('SIGTERM', cancel);
process.on('SIGINT', cancel);
// The top-level worker owns the SSH connection; internal children have ignored stdin.
if (!desktopMode) {
  process.stdin.resume();
  process.stdin.on('end', cancel);
}

function launch(command, args, env = process.env, { background = false } = {}) {
  if (interrupted) throw new Error('Remote test run cancelled.');
  const child = spawn(command, args, { cwd: source, env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
  children.add(child);
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => { children.delete(child); resolve(code ?? 130); });
  });
  if (background) return { child, completed };
  return completed.then((code) => { if (code) throw new Error(`${command} exited with status ${code}`); });
}

function binary(name, env) {
  const found = env.PATH.split(path.delimiter).map((dir) => path.join(dir, name)).find((file) => {
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Missing ${name} on the Linux test host. See docs/codex/PLAYWRIGHT_TESTING.md. No desktop fallback is allowed.`);
  return found;
}

function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

async function prepareDependencies() {
  const lockHash = hashFile(path.join(source, 'package-lock.json'));
  const cache = path.join(lab, 'dependencies', `${lockHash}-node${process.versions.node.split('.')[0]}-${process.arch}`);
  if (!fs.existsSync(path.join(cache, 'ready'))) {
    // A failed install has no ready marker and is rebuilt on the next attempt.
    fs.rmSync(cache, { recursive: true, force: true });
    fs.mkdirSync(cache, { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(source, file), path.join(cache, file));
    const seed = process.env.SIGNBOARD_PLAYWRIGHT_DEPENDENCY_SEED || '/home/cdevroe/src/signboard-codex-test';
    if (fs.existsSync(path.join(seed, 'node_modules/electron/dist/electron'))
      && fs.existsSync(path.join(seed, 'package-lock.json')) && hashFile(path.join(seed, 'package-lock.json')) === lockHash) {
      console.log('Reusing matching Linux dependencies (independent copy).');
      await launch('cp', ['-a', '--reflink=auto', path.join(seed, 'node_modules'), path.join(cache, 'node_modules')]);
    } else {
      console.log('Installing Linux dependencies for this lockfile.');
      await launch('npm', ['ci', '--prefix', cache, '--no-audit', '--no-fund'], {
        ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', SHARP_IGNORE_GLOBAL_LIBVIPS: '1',
      });
    }
    fs.writeFileSync(path.join(cache, 'ready'), `${lockHash}\n`);
  }
  await launch('cp', ['-a', '--reflink=auto', path.join(cache, 'node_modules'), path.join(source, 'node_modules')]);
}

async function desktop(env) {
  const wmConfig = path.join(runRoot, 'openbox.xml');
  fs.writeFileSync(wmConfig, '<openbox_config xmlns="http://openbox.org/3.4/rc"><focus><focusNew>yes</focusNew>'
    + '<followMouse>no</followMouse></focus><desktops><number>1</number></desktops><keyboard/><mouse/></openbox_config>\n');
  const wm = launch(binary('openbox', env), ['--sm-disable', '--config-file', wmConfig], env, { background: true });
  try {
    let ready = false;
    const xprop = binary('xprop', env);
    for (let i = 0; i < 100; i++) {
      if (wm.child.exitCode !== null || interrupted) throw new Error('Virtual desktop window manager stopped.');
      const state = execFileSync(xprop, ['-root', '_NET_SUPPORTING_WM_CHECK'], { env, encoding: 'utf8' });
      if (/window id # 0x[1-9a-f]/i.test(state)) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Virtual desktop did not become ready.');
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'playwright-run.json'), 'utf8'));
    console.log(`Virtual desktop ${env.DISPLAY}; Node ${process.version}; source ${manifest.sha256}`);
    if (manifest.smartLabConfig) env = { ...env, SIGNBOARD_SMART_LAB_CONFIG: manifest.smartLabConfig };
    await launch(process.execPath, [path.join(source, 'node_modules/@playwright/test/cli.js'), 'test', ...manifest.args],
      manifest.debug ? { ...env, DEBUG: 'pw:browser' } : env);
  } finally {
    try { process.kill(-wm.child.pid, 'SIGTERM'); } catch { /* already exited */ }
    await wm.completed;
  }
}

async function main() {
  if (process.platform !== 'linux') throw new Error('This worker requires a Linux virtual display.');
  const env = {
    ...process.env,
    PATH: `${toolsRoot}/bin:${process.env.PATH}`,
    LD_LIBRARY_PATH: `${toolsRoot}/lib${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
    XDG_DATA_DIRS: `${toolsRoot}/share:/usr/local/share:/usr/share`,
  };
  if (desktopMode) return desktop(env);
  // Check isolation tools before doing any build work. Never borrow DISPLAY=:0.
  for (const tool of ['Xvfb', 'xvfb-run', 'xauth', 'openbox', 'xprop', 'dbus-run-session']) binary(tool, env);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'playwright-run.json'), 'utf8'));
  for (const file of manifest.files) {
    if (hashFile(path.join(source, file.path)) !== file.sha256) throw new Error(`Source transfer mismatch: ${file.path}`);
  }
  const output = path.join(source, 'output/playwright');
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(path.join(source, 'playwright-run.json'), path.join(output, 'source.json'));
  try {
    await prepareDependencies();
    await launch('bash', ['buildjs.sh']);
    // Chromium's Unix socket paths must stay short. systemd removes this private
    // runtime directory even if the service is force-killed before our finally.
    temporaryRoot = process.env.RUNTIME_DIRECTORY;
    if (!temporaryRoot || temporaryRoot.length > 55) throw new Error('A short, private systemd RuntimeDirectory is required.');
    const isolated = { ...env, SIGNBOARD_PLAYWRIGHT_VIRTUAL_DESKTOP: '1',
      HOME: path.join(temporaryRoot, 'home'), TMPDIR: path.join(temporaryRoot, 'tmp'),
      XDG_RUNTIME_DIR: path.join(temporaryRoot, 'runtime'), XDG_CONFIG_HOME: path.join(temporaryRoot, 'home/.config'),
      XDG_CACHE_HOME: path.join(temporaryRoot, 'home/.cache'), XDG_DATA_HOME: path.join(temporaryRoot, 'home/.local/share'),
      ELECTRON_OZONE_PLATFORM_HINT: 'x11', XDG_SESSION_TYPE: 'x11', GDK_BACKEND: 'x11',
      XDG_CURRENT_DESKTOP: 'Openbox', XDG_SESSION_DESKTOP: 'openbox', DESKTOP_SESSION: 'openbox',
    };
    for (const key of ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'ELECTRON_RUN_AS_NODE',
      'SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL', 'SIGNBOARD_PLAYWRIGHT_FOREGROUND']) delete isolated[key];
    for (const key of ['HOME', 'TMPDIR', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
      fs.mkdirSync(isolated[key], { recursive: true, mode: 0o700 });
    }
    const portalDirectory = path.join(isolated.XDG_CONFIG_HOME, 'xdg-desktop-portal');
    fs.mkdirSync(portalDirectory, { recursive: true });
    fs.writeFileSync(path.join(portalDirectory, 'portals.conf'), '[preferred]\ndefault=gtk\n');
    await launch(binary('xvfb-run', isolated), ['--auto-servernum', '--server-args=-screen 0 1440x1000x24 -nolisten tcp',
      'dbus-run-session', '--', process.execPath, __filename, runRoot, '--desktop'], isolated);
  } finally {
    stopChildren();
    // Keep source + diagnostics for review, but not duplicate dependencies/profiles.
    fs.rmSync(path.join(source, 'node_modules'), { recursive: true, force: true });
    // systemd removes RuntimeDirectory after all portal/Electron children stop.
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = interrupted ? 130 : 1; })
  .finally(() => { stopChildren(); process.stdin.pause(); });
