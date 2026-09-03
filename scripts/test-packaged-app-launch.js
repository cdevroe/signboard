#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const timeoutMs = 45_000;

function readAppArgument(argv) {
  const appIndex = argv.indexOf('--app');
  if (appIndex < 0 || !argv[appIndex + 1]) {
    return '';
  }
  return path.resolve(repoRoot, argv[appIndex + 1]);
}

function resolveExecutable(appPath) {
  if (process.platform === 'darwin') {
    return path.join(appPath, 'Contents', 'MacOS', 'Signboard');
  }
  return appPath;
}

async function run() {
  const appPath = readAppArgument(process.argv.slice(2));
  if (!appPath) {
    throw new Error('Pass the packaged application path with --app <path>.');
  }

  const executablePath = resolveExecutable(appPath);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged application executable not found: ${executablePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-packaged-smoke-'));
  const userDataPath = path.join(tempRoot, 'user-data');
  const markerPath = path.join(userDataPath, 'packaged-smoke-test.json');
  fs.mkdirSync(userDataPath, { recursive: true });

  let stdout = '';
  let stderr = '';
  let child;

  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(executablePath, ['--packaged-smoke-test'], {
        env: {
          ...process.env,
          SIGNBOARD_USER_DATA_DIR: userDataPath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));

      setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null) {
          child.kill('SIGKILL');
          reject(new Error(`Packaged application did not finish its smoke test within ${timeoutMs}ms.`));
        }
      }, timeoutMs).unref();
    });

    if (result.code !== 0) {
      throw new Error(
        `Packaged application exited with code ${result.code ?? '<none>'}`
        + `${result.signal ? ` (${result.signal})` : ''}.`
      );
    }

    if (!fs.existsSync(markerPath)) {
      throw new Error('Packaged application did not write its renderer-ready smoke-test marker.');
    }

    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (marker.version !== packageJson.version) {
      throw new Error(`Packaged version mismatch. Expected ${packageJson.version}, found ${marker.version || '<missing>'}.`);
    }
    if (marker.isPackaged !== true || marker.rendererLoaded !== true) {
      throw new Error(`Packaged renderer did not report ready: ${JSON.stringify(marker)}`);
    }

    console.log(`Packaged application launch test passed for Signboard ${marker.version}.`);
  } catch (error) {
    if (stdout.trim()) {
      console.error(`Packaged app stdout:\n${stdout.trim()}`);
    }
    if (stderr.trim()) {
      console.error(`Packaged app stderr:\n${stderr.trim()}`);
    }
    throw error;
  } finally {
    if (child && child.exitCode == null && child.signalCode == null) {
      child.kill('SIGKILL');
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(`Packaged application launch test failed: ${error.message}`);
  process.exit(1);
});
