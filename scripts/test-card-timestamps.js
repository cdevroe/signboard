const assert = require('assert');
const {
  normalizeTimestamp,
  resolveCardTimestamps,
} = require('../lib/cardTimestamps');

function createStats(values = {}) {
  return {
    birthtime: values.birthtime,
    ctime: values.ctime,
    mtime: values.mtime,
  };
}

function run() {
  assert.strictEqual(
    normalizeTimestamp('2026-03-10T14:30:00.000Z'),
    '2026-03-10T14:30:00.000Z',
    'expected valid ISO timestamps to normalize',
  );
  assert.strictEqual(normalizeTimestamp('not a date'), '', 'expected invalid timestamps to be ignored');

  const frontmatterCreated = resolveCardTimestamps({
    createdAt: '2026-01-10T12:00:00.000Z',
    activity: [
      { type: 'created', at: '2026-01-09T12:00:00.000Z' },
    ],
  }, createStats({
    birthtime: new Date('2026-01-08T12:00:00.000Z'),
    ctime: new Date('2026-01-08T13:00:00.000Z'),
    mtime: new Date('2026-03-10T12:00:00.000Z'),
  }));

  assert.strictEqual(frontmatterCreated.createdAt, '2026-01-10T12:00:00.000Z');
  assert.strictEqual(frontmatterCreated.createdAtSource, 'frontmatter');
  assert.strictEqual(frontmatterCreated.updatedAt, '2026-03-10T12:00:00.000Z');

  const activityCreated = resolveCardTimestamps({
    activity: [
      { type: 'created', at: '2026-01-09T12:00:00.000Z' },
    ],
  }, createStats({
    birthtime: new Date('2026-01-08T12:00:00.000Z'),
    ctime: new Date('2026-01-08T13:00:00.000Z'),
    mtime: new Date('2026-03-10T12:00:00.000Z'),
  }));

  assert.strictEqual(activityCreated.createdAt, '2026-01-09T12:00:00.000Z');
  assert.strictEqual(activityCreated.createdAtSource, 'activity');

  const legacyCreated = resolveCardTimestamps({}, createStats({
    birthtime: new Date('2026-01-08T12:00:00.000Z'),
    ctime: new Date('2026-01-08T13:00:00.000Z'),
    mtime: new Date('2026-03-10T12:00:00.000Z'),
  }));

  assert.strictEqual(legacyCreated.createdAt, '2026-01-08T12:00:00.000Z');
  assert.strictEqual(legacyCreated.createdAtSource, 'filesystem');

  console.log('Card timestamp tests passed.');
}

run();
