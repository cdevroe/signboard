const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  installPacmanPackage,
  isPacmanPackagePath,
  validatePacmanPackageWithSystem,
} = require('../lib/linuxPackageInstaller');

function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-pacman-installer-'));
  const packagePath = path.join(tempRoot, 'signboard_linux_x64.pacman');
  fs.writeFileSync(packagePath, Buffer.from([0x28, 0xb5, 0x2f, 0xfd]));

  try {
    assert.strictEqual(isPacmanPackagePath(packagePath), true);
    assert.strictEqual(isPacmanPackagePath(`${packagePath}.txt`), false);

    const commands = [];
    const successfulRunner = (command, args) => {
      commands.push([command, [...args]]);
      return { status: 0, stdout: '', stderr: '' };
    };

    assert.strictEqual(validatePacmanPackageWithSystem(packagePath, successfulRunner), path.resolve(packagePath));
    commands.length = 0;
    assert.deepStrictEqual(installPacmanPackage(packagePath, successfulRunner), {
      ok: true,
      packagePath: path.resolve(packagePath),
    });
    assert.deepStrictEqual(commands, [
      ['pacman', ['-Qp', path.resolve(packagePath)]],
      ['pkexec', ['pacman', '-U', '--noconfirm', path.resolve(packagePath)]],
    ]);
    assert.strictEqual(commands.flat(3).includes('-Sy'), false);

    const failedCommands = [];
    assert.throws(() => installPacmanPackage(packagePath, (command, args) => {
      failedCommands.push([command, [...args]]);
      return { status: command === 'pacman' ? 1 : 0, stderr: 'invalid package' };
    }), /Command pacman exited with code 1/);
    assert.strictEqual(failedCommands.some(([command]) => command === 'pkexec'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Linux package installer tests passed.');
}

run();
