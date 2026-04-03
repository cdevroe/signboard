#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const packageJsonPath = path.join(repoRoot, 'package.json');
const electronBuilderJsonPath = path.join(repoRoot, 'electron-builder.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const electronBuilderConfig = fs.existsSync(electronBuilderJsonPath)
  ? JSON.parse(fs.readFileSync(electronBuilderJsonPath, 'utf8'))
  : null;
const version = packageJson.version;
const allowPartial = process.argv.includes('--allow-partial');

const requiredMetadataFiles = [
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
  'latest-linux-arm64.yml',
];

const requiredArtifacts = [
  `signboard_${version}_mac_universal.dmg`,
  `signboard_${version}_mac_universal.zip`,
  `signboard_${version}_win.exe`,
  `signboard_${version}_linux_x86_64.AppImage`,
  `signboard_${version}_linux_amd64.deb`,
  `signboard_${version}_linux_arm64.AppImage`,
  `signboard_${version}_linux_arm64.deb`,
];

const artifactPattern = new RegExp(
  `^signboard_${escapeForRegex(version)}_(mac|linux)_([A-Za-z0-9_]+)\\.(dmg|zip|exe|AppImage|deb|rpm)$`
);

const windowsArtifactPattern = new RegExp(
  `^signboard_${escapeForRegex(version)}_win(?:_([A-Za-z0-9_]+))?\\.(exe)$`
);

const metadataPlatformRules = {
  'latest.yml': (url) => url === `signboard_${version}_win.exe`,
  'latest-mac.yml': (url) => url.includes(`signboard_${version}_mac_universal`),
  'latest-linux.yml': (url) =>
    url.includes(`signboard_${version}_linux_`) &&
    !url.includes(`signboard_${version}_linux_arm64`),
  'latest-linux-arm64.yml': (url) => url.includes(`signboard_${version}_linux_arm64`),
};

const deprecatedPublicArtifacts = [
  `signboard_${version}_mac_arm64.dmg`,
  `signboard_${version}_mac_arm64.zip`,
  `signboard_${version}_mac_x64.dmg`,
  `signboard_${version}_mac_x64.zip`,
  `signboard_${version}_win_x64.exe`,
  `signboard_${version}_win_arm64.exe`,
];

const curatedDownloads = [
  { label: 'Download for macOS (Universal)', file: `signboard_${version}_mac_universal.dmg` },
  { label: 'Download for Windows', file: `signboard_${version}_win.exe` },
  { label: 'Linux AppImage (x64)', file: `signboard_${version}_linux_x86_64.AppImage` },
  { label: 'Linux AppImage (ARM64)', file: `signboard_${version}_linux_arm64.AppImage` },
  { label: 'Linux deb (x64)', file: `signboard_${version}_linux_amd64.deb` },
  { label: 'Linux deb (ARM64)', file: `signboard_${version}_linux_arm64.deb` },
];

const errors = [];
const warnings = [];

if (!fs.existsSync(distDir)) {
  fail(`dist directory not found: ${distDir}`);
}

const distEntries = fs.readdirSync(distDir);
const distEntrySet = new Set(distEntries);

validateArtifactNameTemplates();
validateDeprecatedPublicArtifacts();
validateRequiredArtifacts();
validateMetadataFiles();

if (errors.length > 0) {
  console.error(`\nRelease asset verification failed for version ${version}.\n`);
  errors.forEach((error) => console.error(`- ${error}`));
  if (warnings.length > 0) {
    console.error('\nWarnings:');
    warnings.forEach((warning) => console.error(`- ${warning}`));
  }
  process.exit(1);
}

console.log(`\nRelease asset verification passed for version ${version}.`);
if (warnings.length > 0) {
  console.log('\nWarnings:');
  warnings.forEach((warning) => console.log(`- ${warning}`));
}
console.log('\nCurated release-body downloads:');
curatedDownloads
  .filter(({ file }) => distEntrySet.has(file))
  .forEach(({ label, file }) => console.log(`- ${label}: dist/${file}`));
console.log('\nUpload these files to the GitHub release:');

const uploadFiles = [
  ...requiredArtifacts.filter((name) => distEntrySet.has(name)),
  ...requiredArtifacts
    .filter((name) => needsBlockmap(name))
    .map((name) => `${name}.blockmap`)
    .filter((name) => distEntrySet.has(name)),
  ...requiredMetadataFiles.filter((name) => distEntrySet.has(name)),
];

Array.from(new Set(uploadFiles))
  .sort()
  .forEach((name) => console.log(`- dist/${name}`));

function validateArtifactNameTemplates() {
  const topLevelArtifactName = packageJson.build?.artifactName;
  const nsisArtifactName = packageJson.build?.nsis?.artifactName;
  const requiredTokens = ['${version}', '${os}', '${arch}'];

  ensureTokens(topLevelArtifactName, 'package.json build.artifactName', requiredTokens);
  if (nsisArtifactName) {
    ensureTokens(nsisArtifactName, 'package.json build.nsis.artifactName', ['${version}', '${os}']);
    ensureDoesNotInclude(nsisArtifactName, 'package.json build.nsis.artifactName', '${arch}');
  }

  if (electronBuilderConfig) {
    ensureTokens(
      electronBuilderConfig.artifactName,
      'electron-builder.json artifactName',
      requiredTokens
    );
    if (electronBuilderConfig.nsis?.artifactName) {
      ensureTokens(
        electronBuilderConfig.nsis.artifactName,
        'electron-builder.json nsis.artifactName',
        ['${version}', '${os}']
      );
      ensureDoesNotInclude(
        electronBuilderConfig.nsis.artifactName,
        'electron-builder.json nsis.artifactName',
        '${arch}'
      );
    }
  }
}

function validateDeprecatedPublicArtifacts() {
  for (const artifact of deprecatedPublicArtifacts) {
    if (distEntrySet.has(artifact)) {
      addIssue(
        `Found non-curated public artifact: dist/${artifact}. Standard releases should promote the curated download set instead.`,
        true
      );
    }
  }
}

function validateRequiredArtifacts() {
  for (const artifact of requiredArtifacts) {
    if (!distEntrySet.has(artifact)) {
      addIssue(`Missing required artifact: dist/${artifact}`, allowPartial);
      continue;
    }

    const match = artifact.startsWith(`signboard_${version}_win`)
      ? artifact.match(windowsArtifactPattern)
      : artifact.match(artifactPattern);
    if (!match) {
      addIssue(`Artifact name does not follow required pattern: dist/${artifact}`, false);
      continue;
    }

    const platform = artifact.startsWith(`signboard_${version}_win`) ? 'win' : match[1];
    const arch = platform === 'win' ? (match[1] || '') : match[2];
    const extension = platform === 'win' ? match[2] : match[3];

    if (!isKnownArchForPlatform(platform, arch)) {
      addIssue(
        `Unexpected architecture token "${arch}" in artifact: dist/${artifact}`,
        false
      );
    }

    if (needsBlockmap(artifact)) {
      const blockmapFile = `${artifact}.blockmap`;
      if (!distEntrySet.has(blockmapFile)) {
        addIssue(
          `Missing blockmap for differential updates: dist/${blockmapFile}`,
          allowPartial
        );
      }
    }

    if (!isKnownExtension(extension)) {
      addIssue(`Unexpected artifact extension ".${extension}" in dist/${artifact}`, false);
    }
  }
}

function validateMetadataFiles() {
  for (const metadataFile of requiredMetadataFiles) {
    if (!distEntrySet.has(metadataFile)) {
      addIssue(`Missing updater metadata file: dist/${metadataFile}`, allowPartial);
      continue;
    }

    const metadataPath = path.join(distDir, metadataFile);
    let metadata;
    try {
      metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      addIssue(`Could not parse metadata YAML ${metadataFile}: ${error.message}`, false);
      continue;
    }

    if (!metadata || typeof metadata !== 'object') {
      addIssue(`Metadata file is empty or invalid: dist/${metadataFile}`, false);
      continue;
    }

    if (String(metadata.version || '') !== version) {
      addIssue(
        `Metadata version mismatch in ${metadataFile}. Expected ${version}, found ${metadata.version || '<missing>'}.`,
        allowPartial
      );
    }

    if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
      addIssue(`Metadata file has no assets listed: dist/${metadataFile}`, false);
      continue;
    }

    const filesFromMetadata = [];
    for (const entry of metadata.files) {
      const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
      if (!url) {
        addIssue(`Metadata file contains an entry without a URL: dist/${metadataFile}`, false);
        continue;
      }

      filesFromMetadata.push(url);

      if (!distEntrySet.has(url)) {
        addIssue(`Metadata references missing file "${url}" in ${metadataFile}`, allowPartial);
      }

      const match = url.startsWith(`signboard_${version}_win`)
        ? url.match(windowsArtifactPattern)
        : url.match(artifactPattern);
      if (!match) {
        addIssue(`Metadata URL has invalid naming format in ${metadataFile}: ${url}`, allowPartial);
        continue;
      }

      const platformRule = metadataPlatformRules[metadataFile];
      if (platformRule && !platformRule(url)) {
        addIssue(`Metadata URL is not valid for ${metadataFile}: ${url}`, allowPartial);
      }
    }

    const primaryPath = typeof metadata.path === 'string' ? metadata.path.trim() : '';
    if (!primaryPath) {
      addIssue(`Metadata file is missing "path": dist/${metadataFile}`, false);
    } else if (!filesFromMetadata.includes(primaryPath)) {
      addIssue(`Metadata "path" is not present in files[] for ${metadataFile}: ${primaryPath}`, false);
    }
  }
}

function addIssue(message, asWarning) {
  if (asWarning) {
    warnings.push(message);
    return;
  }
  errors.push(message);
}

function ensureTokens(value, label, requiredTokensToCheck) {
  if (!value || typeof value !== 'string') {
    addIssue(`Missing ${label}.`, false);
    return;
  }

  for (const token of requiredTokensToCheck) {
    if (!value.includes(token)) {
      addIssue(`${label} must include ${token}. Current value: ${value}`, false);
    }
  }
}

function ensureDoesNotInclude(value, label, token) {
  if (typeof value === 'string' && value.includes(token)) {
    addIssue(`${label} should not include ${token}. Current value: ${value}`, false);
  }
}

function isKnownArchForPlatform(platform, arch) {
  if (platform === 'win') {
    return arch === '' || arch === 'x64' || arch === 'arm64';
  }
  if (platform === 'mac') {
    return arch === 'arm64' || arch === 'x64' || arch === 'universal';
  }
  if (platform === 'linux') {
    return arch === 'x86_64' || arch === 'amd64' || arch === 'arm64';
  }
  return false;
}

function needsBlockmap(name) {
  return name.endsWith('.dmg') || name.endsWith('.zip') || name.endsWith('.exe');
}

function isKnownExtension(extension) {
  return ['dmg', 'zip', 'exe', 'AppImage', 'deb', 'rpm'].includes(extension);
}

function escapeForRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
