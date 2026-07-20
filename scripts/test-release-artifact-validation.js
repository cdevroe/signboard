const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  computeFileSha512,
  inspectDebianPackageBuffer,
  inspectDebianPackageFile,
  listArArchiveMembers,
} = require('../lib/releaseArtifactValidation');

function createArArchive(entries) {
  const chunks = [Buffer.from('!<arch>\n', 'ascii')];

  for (const [name, rawContent] of entries) {
    const content = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent);
    const normalizedName = `${name}/`.padEnd(16, ' ').slice(0, 16);
    const header = [
      normalizedName,
      '0'.padEnd(12, ' '),
      '0'.padEnd(6, ' '),
      '0'.padEnd(6, ' '),
      '100644'.padEnd(8, ' '),
      String(content.length).padEnd(10, ' '),
      '`\n',
    ].join('');
    chunks.push(Buffer.from(header, 'ascii'), content);
    if (content.length % 2 === 1) {
      chunks.push(Buffer.from('\n'));
    }
  }

  return Buffer.concat(chunks);
}

function run() {
  const validDeb = createArArchive([
    ['debian-binary', '2.0\n'],
    ['control.tar.xz', 'control'],
    ['data.tar.xz', 'data'],
  ]);
  const members = listArArchiveMembers(validDeb);
  assert.deepStrictEqual(
    members.map(({ name }) => name),
    ['debian-binary', 'control.tar.xz', 'data.tar.xz'],
  );
  assert.deepStrictEqual(inspectDebianPackageBuffer(validDeb), {
    valid: true,
    members: ['debian-binary', 'control.tar.xz', 'data.tar.xz'],
    errors: [],
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-deb-validation-'));
  const validDebPath = path.join(tempDir, 'valid.deb');
  try {
    fs.writeFileSync(validDebPath, validDeb);
    assert.deepStrictEqual(inspectDebianPackageFile(validDebPath), {
      valid: true,
      members: ['debian-binary', 'control.tar.xz', 'data.tar.xz'],
      errors: [],
    });
    assert.strictEqual(
      computeFileSha512(validDebPath),
      require('crypto').createHash('sha512').update(validDeb).digest('base64'),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const emptyMacAr = createArArchive([
    ['__.SYMDEF', Buffer.alloc(20)],
  ]);
  const invalidDeb = inspectDebianPackageBuffer(emptyMacAr);
  assert.strictEqual(invalidDeb.valid, false);
  assert(invalidDeb.errors.includes('Missing debian-binary member.'));
  assert(invalidDeb.errors.includes('Missing control.tar member.'));
  assert(invalidDeb.errors.includes('Missing data.tar member.'));

  const wrongVersion = inspectDebianPackageBuffer(createArArchive([
    ['debian-binary', '1.0\n'],
    ['control.tar.gz', 'control'],
    ['data.tar.gz', 'data'],
  ]));
  assert.strictEqual(wrongVersion.valid, false);
  assert(wrongVersion.errors.includes('Unsupported or invalid debian-binary version.'));

  const malformed = inspectDebianPackageBuffer(Buffer.from('not a package'));
  assert.strictEqual(malformed.valid, false);
  assert.deepStrictEqual(malformed.errors, ['File is not an ar archive.']);

  console.log('Release artifact validation tests passed.');
}

run();
