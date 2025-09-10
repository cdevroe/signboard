// scripts/notarize.js
const { notarize } = require('@electron/notarize');
require('dotenv').config();

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = packager.appInfo.productFilename;

  const appleId = process.env.APPLE_ID;
  const appleIdPass = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID; // REQUIRED for Apple ID + password

  if (!appleId || !appleIdPass) {
    console.warn('Skipping notarization: APPLE_ID and/or APPLE_APP_SPECIFIC_PASSWORD not set.');
    return;
  }

  console.log(`Notarizing ${appName} with Apple ID ${appleId}...`);

  try {
    await notarize({
      appBundleId: packager.appInfo.appId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId,
      appleIdPassword: appleIdPass,
      teamId,
      tool: 'notarytool', // modern replacement for altool
    });

    console.log(`Notarization complete: ${appName}`);
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};