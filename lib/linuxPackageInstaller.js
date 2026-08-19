const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isPacmanPackagePath(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.pacman';
}

function defaultCommandRunner(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runCheckedCommand(command, args, commandRunner = defaultCommandRunner) {
  const result = commandRunner(command, args);
  if (result && result.error) {
    throw result.error;
  }
  const exitCode = Number.isInteger(result?.status) ? result.status : 1;
  if (exitCode !== 0) {
    const detail = String(result?.stderr || result?.stdout || '').trim();
    const error = new Error(`Command ${command} exited with code ${exitCode}${detail ? `: ${detail}` : ''}`);
    error.exitCode = exitCode;
    error.command = command;
    throw error;
  }
  return result;
}

function validatePacmanPackageWithSystem(filePath, commandRunner = defaultCommandRunner) {
  const resolvedPath = path.resolve(String(filePath || ''));
  if (!isPacmanPackagePath(resolvedPath) || !fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error('The downloaded Arch package is missing or has an invalid filename.');
  }
  runCheckedCommand('pacman', ['-Qp', resolvedPath], commandRunner);
  return resolvedPath;
}

function installPacmanPackage(filePath, commandRunner = defaultCommandRunner) {
  const resolvedPath = validatePacmanPackageWithSystem(filePath, commandRunner);
  // Deliberately use only `pacman -U`. Never refresh package databases with
  // `pacman -Sy`, which can create an unsupported partial-upgrade state.
  runCheckedCommand('pkexec', ['pacman', '-U', '--noconfirm', resolvedPath], commandRunner);
  return { ok: true, packagePath: resolvedPath };
}

module.exports = {
  defaultCommandRunner,
  installPacmanPackage,
  isPacmanPackagePath,
  runCheckedCommand,
  validatePacmanPackageWithSystem,
};
