#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REQUIRED_PACKAGED_GLOBS = [
  'app/**',
  'bin/**',
  'lib/**',
  'shared/**',
  'static/**',
];

function validatePackagingConfig(config) {
  const files = Array.isArray(config?.files) ? config.files : [];
  return REQUIRED_PACKAGED_GLOBS
    .filter((requiredGlob) => !files.includes(requiredGlob))
    .map((requiredGlob) => `electron-builder.json files must include ${requiredGlob}.`);
}

function run() {
  const missingShared = validatePackagingConfig({
    files: REQUIRED_PACKAGED_GLOBS.filter((entry) => entry !== 'shared/**'),
  });
  assert.deepStrictEqual(missingShared, [
    'electron-builder.json files must include shared/**.',
  ]);

  const repoRoot = path.resolve(__dirname, '..');
  const configPath = path.join(repoRoot, 'electron-builder.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const errors = validatePackagingConfig(config);

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log('Packaging configuration validation passed.');
}

module.exports = {
  REQUIRED_PACKAGED_GLOBS,
  validatePackagingConfig,
};

if (require.main === module) {
  run();
}
