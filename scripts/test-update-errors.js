const assert = require('assert');
const {
  getInvalidLinuxPackagePresentation,
  getUpdaterErrorPresentation,
  isLinuxPackageInstallError,
} = require('../lib/updateErrors');

function run() {
  const pkexecError = new Error('Command pkexec exited with code 100');
  assert.strictEqual(isLinuxPackageInstallError(pkexecError, 'linux'), true);
  assert.strictEqual(isLinuxPackageInstallError(pkexecError, 'win32'), false);

  const linuxPresentation = getUpdaterErrorPresentation(pkexecError, 'linux');
  assert.strictEqual(linuxPresentation.title, 'Update Installation Failed');
  assert.strictEqual(linuxPresentation.message, 'Ubuntu could not install the downloaded update.');
  assert(linuxPresentation.detail.includes('exit code 100'));
  assert(linuxPresentation.detail.includes('current Signboard installation has not been replaced'));
  assert.strictEqual(linuxPresentation.offerDownloads, true);

  const canceledPresentation = getUpdaterErrorPresentation(
    new Error('Command pkexec exited with code 126'),
    'linux',
  );
  assert.deepStrictEqual(canceledPresentation, {
    title: 'Update Canceled',
    message: 'Administrator approval was canceled.',
    detail: 'Signboard was not updated. Your current installation has not been changed.',
    offerDownloads: false,
  });

  const deniedPresentation = getUpdaterErrorPresentation(
    new Error('Command /usr/bin/pkexec exited with code 127'),
    'linux',
  );
  assert.strictEqual(deniedPresentation.title, 'Administrator Approval Required');
  assert(deniedPresentation.detail.includes('install the latest .deb manually'));
  assert.strictEqual(deniedPresentation.offerDownloads, true);

  const genericPresentation = getUpdaterErrorPresentation(new Error('Network unavailable'), 'linux');
  assert.deepStrictEqual(genericPresentation, {
    title: 'Updater Error',
    message: 'Signboard encountered an updater error.',
    detail: 'Network unavailable',
    offerDownloads: false,
  });

  const invalidPackagePresentation = getInvalidLinuxPackagePresentation({
    errors: ['Missing debian-binary member.', 'Missing data.tar member.'],
  });
  assert.strictEqual(invalidPackagePresentation.title, 'Invalid Update Download');
  assert(invalidPackagePresentation.detail.includes('Missing debian-binary member.'));
  assert(invalidPackagePresentation.detail.includes('Open Downloads'));
  assert.strictEqual(invalidPackagePresentation.offerDownloads, true);

  console.log('Updater error tests passed.');
}

run();
