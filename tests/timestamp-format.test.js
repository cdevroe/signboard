import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { formatTimestamp } = require('../app/utilities/timestampListItem');

describe('formatTimestamp', () => {
  it('formats a February date correctly', () => {
    const febDate = new Date(2026, 1, 5, 9, 3);
    expect(formatTimestamp(febDate)).toBe('February 5, 09:03');
  });

  it('formats an October date correctly', () => {
    const octDate = new Date(2026, 9, 21, 17, 45);
    expect(formatTimestamp(octDate)).toBe('October 21, 17:45');
  });

  it('formats a January date with zero-padded minutes', () => {
    const janDate = new Date(2026, 0, 1, 0, 5);
    expect(formatTimestamp(janDate)).toBe('January 1, 00:05');
  });
});
