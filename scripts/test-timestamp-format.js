const assert = require('assert');

const { formatTimestamp } = require('../app/utilities/timestampListItem');

function run() {
    const febDate = new Date(2026, 1, 5, 9, 3);
    assert.strictEqual(formatTimestamp(febDate), 'February 5, 09:03');

    const octDate = new Date(2026, 9, 21, 17, 45);
    assert.strictEqual(formatTimestamp(octDate), 'October 21, 17:45');

    const janDate = new Date(2026, 0, 1, 0, 5);
    assert.strictEqual(formatTimestamp(janDate), 'January 1, 00:05');

    console.log('Timestamp format tests passed.');
}

run();
