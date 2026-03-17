import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  readCard,
  writeCard,
  updateFrontmatter,
} = require('../lib/cardFrontmatter');

describe('cardFrontmatter', () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-frontmatter-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse existing legacy file format', async () => {
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
    expect(legacyCard.frontmatter.title).toBe('Legacy title');
    expect(legacyCard.frontmatter.due).toBe('2026-03-14');
    expect(legacyCard.frontmatter.labels).toEqual(['bug', 'urgent']);
    expect(legacyCard.frontmatter.Owner).toBe('Colin');
    expect(legacyCard.body).toBe('Body line 1\nBody line 2');
  });

  it('should preserve body on round-trip', async () => {
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
    expect(secondRead.body).toBe(bodyBefore);
  });

  it('should update one field without losing unknown fields', async () => {
    const roundTripPath = path.join(tmpDir, '002-roundtrip.md');
    await updateFrontmatter(roundTripPath, { due: '2026-05-20' });
    const updated = await readCard(roundTripPath);
    expect(updated.frontmatter.title).toBe('Keep body exact');
    expect(updated.frontmatter.due).toBe('2026-05-20');
    expect(updated.frontmatter.owner).toBe('Colin');
    expect(updated.frontmatter.labels).toEqual(['alpha']);
  });

  it('should handle missing frontmatter', async () => {
    const plainPath = path.join(tmpDir, '010-plain-note.md');
    const plainContent = [
      'Just markdown body',
      '',
      'Second paragraph',
    ].join('\n');

    await fs.writeFile(plainPath, plainContent, 'utf8');

    const plainCard = await readCard(plainPath);
    expect(plainCard.frontmatter.title).toBe('plain-note');
    expect(plainCard.frontmatter.labels).toEqual([]);
    expect(plainCard.body).toBe(plainContent);
  });

  it('should not write due field when null/empty', async () => {
    const noDuePath = path.join(tmpDir, '020-no-due.md');
    await writeCard(noDuePath, {
      frontmatter: { title: 'No Due', due: null, labels: [] },
      body: 'Body',
    });
    const noDueRaw = await fs.readFile(noDuePath, 'utf8');
    expect(noDueRaw).not.toContain('\ndue:');
  });
});
