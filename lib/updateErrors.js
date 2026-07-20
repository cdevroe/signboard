function getUpdaterErrorMessage(error) {
  return String(error?.message || error || 'Unknown error').trim();
}

function isLinuxPackageInstallError(error, platform = process.platform) {
  if (platform !== 'linux') {
    return false;
  }

  return /Command\s+(?:[^\s]*\/)?(?:pkexec|sudo)\s+exited with code\s+\d+/i.test(
    getUpdaterErrorMessage(error)
  );
}

function getUpdaterErrorPresentation(error, platform = process.platform) {
  const rawMessage = getUpdaterErrorMessage(error);

  if (isLinuxPackageInstallError(error, platform)) {
    const exitCodeMatch = rawMessage.match(/exited with code\s+(\d+)/i);
    const exitCode = exitCodeMatch ? exitCodeMatch[1] : 'unknown';
    if (exitCode === '126') {
      return {
        title: 'Update Canceled',
        message: 'Administrator approval was canceled.',
        detail: 'Signboard was not updated. Your current installation has not been changed.',
        offerDownloads: false,
      };
    }
    if (exitCode === '127') {
      return {
        title: 'Administrator Approval Required',
        message: 'Ubuntu could not get permission to install the update.',
        detail: [
          'Signboard was not updated. Your current installation has not been changed.',
          '',
          'You can try again or open Downloads and install the latest .deb manually.',
        ].join('\n'),
        offerDownloads: true,
      };
    }
    return {
      title: 'Update Installation Failed',
      message: 'Ubuntu could not install the downloaded update.',
      detail: [
        `The system package installer rejected the update (exit code ${exitCode}).`,
        'Your current Signboard installation has not been replaced.',
        '',
        'Open Downloads to install the latest .deb manually. Ubuntu’s installer should provide the underlying package error if it still cannot be installed.',
      ].join('\n'),
      offerDownloads: true,
    };
  }

  return {
    title: 'Updater Error',
    message: 'Signboard encountered an updater error.',
    detail: rawMessage,
    offerDownloads: false,
  };
}

function getInvalidLinuxPackagePresentation(validation) {
  const reason = Array.isArray(validation?.errors) && validation.errors.length > 0
    ? validation.errors.join(' ')
    : 'The file is not a valid Debian package.';

  return {
    title: 'Invalid Update Download',
    message: 'Signboard downloaded an invalid Ubuntu installer.',
    detail: [
      reason,
      '',
      'Your current Signboard installation has not been changed. Open Downloads to get the latest .deb manually.',
    ].join('\n'),
    offerDownloads: true,
  };
}

module.exports = {
  getInvalidLinuxPackagePresentation,
  getUpdaterErrorMessage,
  getUpdaterErrorPresentation,
  isLinuxPackageInstallError,
};
