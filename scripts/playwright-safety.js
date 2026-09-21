function isDiscoveryOnly(args) {
  return (args.includes('--list') || args.includes('--help'))
    && !args.some((arg) => /^(--ui|--debug)(=|$)/.test(arg));
}

function assertPlaywrightLaunchAllowed({ platform = process.platform, env = process.env, args = process.argv } = {}) {
  if (isDiscoveryOnly(args) || env.SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL === '1'
    || (platform === 'linux' && env.SIGNBOARD_PLAYWRIGHT_VIRTUAL_DESKTOP === '1')) return;
  throw new Error('Electron UI tests can take over your desktop. Use npm run test:playwright to run on Babu. '
    + 'For a deliberately foreground local run, use npm run test:playwright:local. There is no automatic local fallback.');
}

module.exports = { assertPlaywrightLaunchAllowed, isDiscoveryOnly };
