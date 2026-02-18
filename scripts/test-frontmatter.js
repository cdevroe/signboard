const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  readCard,
  writeCard,
  updateFrontmatter,
} = require('../lib/cardFrontmatter');

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-frontmatter-'));

  try {
    // 1) Parse existing legacy file format
    const legacyPath = path.join(tmpDir, '001-legacy-card.md');
    const legacyContent = [
      '# Legacy title',
      'Due-date: 2026-03-14',
      'Labels: bug, urgent',
      'Owner: Colin',
      '',
      '**********',
      '',
      'Body line 1',
      'Body line 2',
    ].join('\n');

    await fs.writeFile(legacyPath, legacyContent, 'utf8');

    const legacyCard = await readCard(legacyPath);
    assert.strictEqual(legacyCard.frontmatter.title, 'Legacy title');
    assert.strictEqual(legacyCard.frontmatter.due, '2026-03-14');
    assert.deepStrictEqual(legacyCard.frontmatter.labels, ['bug', 'urgent']);
    assert.strictEqual(legacyCard.frontmatter.Owner, 'Colin');
    assert.strictEqual(legacyCard.body, 'Body line 1\nBody line 2');

    // 2) Round-trip body equality
    const roundTripPath = path.join(tmpDir, '002-roundtrip.md');
    const roundTripContent = [
      '---',
      'title: Keep body exact',
      'due: 2026-04-01',
      'labels:',
      '  - alpha',
      'owner: Colin',
      '---',
      'Line one',
      '',
      '- list item',
      '  - nested',
      '',
      '```md',
      '# raw',
      '```',
      '',
    ].join('\n');

    await fs.writeFile(roundTripPath, roundTripContent, 'utf8');

    const firstRead = await readCard(roundTripPath);
    const bodyBefore = firstRead.body;

    await writeCard(roundTripPath, firstRead);

    const secondRead = await readCard(roundTripPath);
    assert.strictEqual(secondRead.body, bodyBefore);

    // 3) Update one field without losing unknown fields
    await updateFrontmatter(roundTripPath, { due: '2026-05-20' });
    const updated = await readCard(roundTripPath);
    assert.strictEqual(updated.frontmatter.title, 'Keep body exact');
    assert.strictEqual(updated.frontmatter.due, '2026-05-20');
    assert.strictEqual(updated.frontmatter.owner, 'Colin');
    assert.deepStrictEqual(updated.frontmatter.labels, ['alpha']);

    // 4) Missing frontmatter should still work
    const plainPath = path.join(tmpDir, '010-plain-note.md');
    const plainContent = [
      'Just markdown body',
      '',
      'Second paragraph',
    ].join('\n');

    await fs.writeFile(plainPath, plainContent, 'utf8');

    const plainCard = await readCard(plainPath);
    assert.strictEqual(plainCard.frontmatter.title, 'plain-note');
    assert.deepStrictEqual(plainCard.frontmatter.labels, []);
    assert.strictEqual(plainCard.body, plainContent);

    // 5) due should not be written when null/empty
    const noDuePath = path.join(tmpDir, '020-no-due.md');
    await writeCard(noDuePath, {
      frontmatter: { title: 'No Due', due: null, labels: [] },
      body: 'Body',
    });
    const noDueRaw = await fs.readFile(noDuePath, 'utf8');
    assert(!noDueRaw.includes('\ndue:'), 'due field should be omitted when null/empty');

    console.log('Frontmatter tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Frontmatter tests failed.');
  console.error(error);
  process.exitCode = 1;
});
