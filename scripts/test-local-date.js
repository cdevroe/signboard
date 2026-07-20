const assert = require('assert');

process.env.TZ = 'America/New_York';

const {
  formatLocalIsoDate,
  getLocalDayRolloverDelay,
  parseLocalIsoDate,
} = require('../shared/localDate');

function run() {
  assert.strictEqual(
    formatLocalIsoDate(new Date(2026, 6, 20, 23, 30)),
    '2026-07-20',
    'expected local formatting not to roll forward with UTC',
  );
  assert.strictEqual(formatLocalIsoDate(new Date('invalid')), '', 'expected invalid dates to be ignored');

  const parsedLeapDay = parseLocalIsoDate('2028-02-29');
  assert(parsedLeapDay, 'expected a valid leap day to parse');
  assert.strictEqual(parsedLeapDay.getFullYear(), 2028);
  assert.strictEqual(parsedLeapDay.getMonth(), 1);
  assert.strictEqual(parsedLeapDay.getDate(), 29);
  assert.strictEqual(parseLocalIsoDate('2026-02-29'), null, 'expected an invalid leap day to be rejected');

  const ordinaryMidnight = new Date(2026, 6, 20, 0, 0, 0, 0);
  assert.strictEqual(
    getLocalDayRolloverDelay(ordinaryMidnight, 0),
    24 * 60 * 60 * 1000,
    'expected an ordinary local day to last 24 hours',
  );

  const springForwardMidnight = new Date(2026, 2, 8, 0, 0, 0, 0);
  assert.strictEqual(
    getLocalDayRolloverDelay(springForwardMidnight, 0),
    23 * 60 * 60 * 1000,
    'expected the spring DST rollover day to last 23 hours',
  );

  const fallBackMidnight = new Date(2026, 10, 1, 0, 0, 0, 0);
  assert.strictEqual(
    getLocalDayRolloverDelay(fallBackMidnight, 0),
    25 * 60 * 60 * 1000,
    'expected the fall DST rollover day to last 25 hours',
  );

  assert.strictEqual(
    getLocalDayRolloverDelay(new Date(2026, 6, 20, 23, 59, 59, 500), 1000),
    1500,
    'expected the rollover buffer to run just after local midnight',
  );

  console.log('Local date tests passed.');
}

run();
