#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sourceCandidates = [
  path.join(buildDir, 'Icon.svg'),
  path.join(buildDir, 'icon-source.svg'),
  path.join(buildDir, 'Icon.png'),
  path.join(buildDir, 'icon-source.png'),
];

const availableSourcePaths = sourceCandidates.filter((candidate) => fs.existsSync(candidate));

if (availableSourcePaths.length === 0) {
  console.error('No icon source found in build/. Expected one of:');
  for (const candidate of sourceCandidates) {
    console.error(`- ${path.relative(repoRoot, candidate)}`);
  }
  process.exit(1);
}

const macIconsetDir = path.join(buildDir, 'icon.iconset');
const linuxIconsDir = path.join(buildDir, 'icons');
const macOutputPath = path.join(buildDir, 'icon.icns');
const windowsOutputPath = path.join(buildDir, 'icon.ico');

const macIconsetFiles = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512];
const windowsSizes = [16, 24, 32, 48, 64, 128, 256];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function runMaybe(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

let activeSourcePath = null;

function renderPng(size, outputPath) {
  const attemptedSources = activeSourcePath ? [activeSourcePath] : availableSourcePaths;
  const failures = [];

  for (const candidate of attemptedSources) {
    const result = runMaybe('sips', ['-z', String(size), String(size), candidate, '--out', outputPath]);
    if (result.status === 0) {
      activeSourcePath = candidate;
      return;
    }

    failures.push({
      candidate,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
    });
  }

  for (const failure of failures) {
    if (failure.stdout) {
      process.stdout.write(failure.stdout);
    }
    if (failure.stderr) {
      process.stderr.write(failure.stderr);
    }
    console.error(`Failed to rasterize ${path.relative(repoRoot, failure.candidate)} (exit ${failure.status})`);
  }

  throw new Error(`Unable to render icon assets to ${path.relative(repoRoot, outputPath)}`);
}

function writeIco(entries, outputPath) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const directorySize = headerSize + (entries.length * directoryEntrySize);
  let imageOffset = directorySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directoryEntries = [];
  const imageBuffers = [];

  for (const entry of entries) {
    const image = fs.readFileSync(entry.filePath);
    const directoryEntry = Buffer.alloc(directoryEntrySize);
    directoryEntry.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    directoryEntry.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    directoryEntry.writeUInt8(0, 2);
    directoryEntry.writeUInt8(0, 3);
    directoryEntry.writeUInt16LE(1, 4);
    directoryEntry.writeUInt16LE(32, 6);
    directoryEntry.writeUInt32LE(image.length, 8);
    directoryEntry.writeUInt32LE(imageOffset, 12);

    directoryEntries.push(directoryEntry);
    imageBuffers.push(image);
    imageOffset += image.length;
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, ...directoryEntries, ...imageBuffers]));
}

function writeIcns(entries, outputPath) {
  const chunks = entries.map((entry) => {
    const image = fs.readFileSync(entry.filePath);
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(entry.type, 0, 4, 'ascii');
    chunkHeader.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([chunkHeader, image]);
  });

  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);

  fs.writeFileSync(outputPath, Buffer.concat([header, ...chunks]));
}

fs.mkdirSync(buildDir, { recursive: true });
fs.rmSync(macIconsetDir, { recursive: true, force: true });
fs.rmSync(linuxIconsDir, { recursive: true, force: true });
fs.mkdirSync(macIconsetDir, { recursive: true });
fs.mkdirSync(linuxIconsDir, { recursive: true });

for (const [fileName, size] of macIconsetFiles) {
  renderPng(size, path.join(macIconsetDir, fileName));
}

for (const size of linuxSizes) {
  renderPng(size, path.join(linuxIconsDir, `${size}x${size}.png`));
}

const windowsPngDir = path.join(buildDir, '.windows-icons');
fs.rmSync(windowsPngDir, { recursive: true, force: true });
fs.mkdirSync(windowsPngDir, { recursive: true });

const windowsEntries = windowsSizes.map((size) => {
  const filePath = path.join(windowsPngDir, `${size}x${size}.png`);
  renderPng(size, filePath);
  return { size, filePath };
});

writeIcns([
  { type: 'icp4', filePath: path.join(macIconsetDir, 'icon_16x16.png') },
  { type: 'icp5', filePath: path.join(macIconsetDir, 'icon_32x32.png') },
  { type: 'icp6', filePath: path.join(macIconsetDir, 'icon_32x32@2x.png') },
  { type: 'ic07', filePath: path.join(macIconsetDir, 'icon_128x128.png') },
  { type: 'ic08', filePath: path.join(macIconsetDir, 'icon_256x256.png') },
  { type: 'ic09', filePath: path.join(macIconsetDir, 'icon_512x512.png') },
  { type: 'ic10', filePath: path.join(macIconsetDir, 'icon_512x512@2x.png') },
], macOutputPath);
writeIco(windowsEntries, windowsOutputPath);

fs.rmSync(windowsPngDir, { recursive: true, force: true });
fs.rmSync(macIconsetDir, { recursive: true, force: true });

console.log(`Generated icons from ${path.relative(repoRoot, activeSourcePath || availableSourcePaths[0])}`);
console.log(`- ${path.relative(repoRoot, macOutputPath)}`);
console.log(`- ${path.relative(repoRoot, windowsOutputPath)}`);
console.log(`- ${path.relative(repoRoot, linuxIconsDir)}`);
