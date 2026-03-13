#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Icns, IcnsImage } = require('@fiahfy/icns');

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const linuxIconsDir = path.join(buildDir, 'icons');
const windowsPngDir = path.join(buildDir, '.windows-icons');
const macOutputPath = path.join(buildDir, 'icon.icns');
const macRuntimePngPath = path.join(buildDir, 'icon-macos.png');
const windowsOutputPath = path.join(buildDir, 'icon.ico');

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

const sourcePath = availableSourcePaths[0];
const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512];
const windowsSizes = [16, 24, 32, 48, 64, 128, 256];
const MAC_CORNER_RADIUS_RATIO = 0.224;

function roundedRectSvg(size, radius) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
}

async function renderPng(size, options = {}) {
  const { roundedCorners = false } = options;
  const renderedBuffer = await sharp(sourcePath, { density: 1024 })
    .resize(size, size, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  if (!roundedCorners) {
    return renderedBuffer;
  }

  const radius = Math.round(size * MAC_CORNER_RADIUS_RATIO);
  return sharp(renderedBuffer)
    .ensureAlpha()
    .composite([
      {
        input: roundedRectSvg(size, radius),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

async function writePng(buffer, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, buffer);
}

async function buildMacIcns() {
  const icns = new Icns();
  const macEntries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ];

  for (const [type, size] of macEntries) {
    const pngBuffer = await renderPng(size, { roundedCorners: true });
    icns.append(IcnsImage.fromPNG(pngBuffer, type));
  }

  await fs.promises.writeFile(macOutputPath, icns.data);
  await writePng(await renderPng(512, { roundedCorners: true }), macRuntimePngPath);
}

async function buildWindowsIco() {
  const { default: pngToIco } = await import('png-to-ico');
  await fs.promises.rm(windowsPngDir, { recursive: true, force: true });
  await fs.promises.mkdir(windowsPngDir, { recursive: true });

  const inputPaths = [];
  for (const size of windowsSizes) {
    const outputPath = path.join(windowsPngDir, `${size}x${size}.png`);
    await writePng(await renderPng(size), outputPath);
    inputPaths.push(outputPath);
  }

  const icoBuffer = await pngToIco(inputPaths);
  await fs.promises.writeFile(windowsOutputPath, icoBuffer);
  await fs.promises.rm(windowsPngDir, { recursive: true, force: true });
}

async function buildLinuxIcons() {
  await fs.promises.rm(linuxIconsDir, { recursive: true, force: true });
  await fs.promises.mkdir(linuxIconsDir, { recursive: true });

  for (const size of linuxSizes) {
    const outputPath = path.join(linuxIconsDir, `${size}x${size}.png`);
    await writePng(await renderPng(size), outputPath);
  }
}

async function main() {
  await fs.promises.mkdir(buildDir, { recursive: true });
  await Promise.all([
    buildMacIcns(),
    buildWindowsIco(),
    buildLinuxIcons(),
  ]);

  console.log(`Generated icons from ${path.relative(repoRoot, sourcePath)}`);
  console.log(`- ${path.relative(repoRoot, macOutputPath)}`);
  console.log(`- ${path.relative(repoRoot, macRuntimePngPath)}`);
  console.log(`- ${path.relative(repoRoot, windowsOutputPath)}`);
  console.log(`- ${path.relative(repoRoot, linuxIconsDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
