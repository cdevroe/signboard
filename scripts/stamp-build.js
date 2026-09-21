#!/usr/bin/env node
const path = require('path');
const { stampBuild, validateStamp } = require('./buildIdentity');
const args = process.argv.slice(2);
const channelIndex = args.indexOf('--channel');
const allowed = new Set(['--check', '--new', '--channel']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error(`Unknown build option: ${args[i]}`);
  if (args[i] === '--channel') {
    if (!['development', 'release'].includes(args[i + 1])) throw new Error('Channel must be development or release.');
    i++;
  }
}
const root = path.resolve(__dirname, '..');
Promise.resolve().then(() => args.includes('--check') ? validateStamp(root)
  : stampBuild(root, { channel: channelIndex < 0 ? 'development' : args[channelIndex + 1], newBuild: args.includes('--new') }))
  .then((info) => console.log(`${info.version} · ${info.channel} build ${info.buildId} · ${info.sourceFingerprint}`))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
