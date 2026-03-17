import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';

function loadSanitizeFileName() {
  const context = { console, Math, Array };
  vm.createContext(context);
  loadSource(context, 'app/utilities/santizeFileName.js');
  return context;
}

describe('sanitizeFileName', () => {
  const context = loadSanitizeFileName();
  const { sanitizeFileName, rand5 } = context;

  it('preserves a clean filename unchanged', async () => {
    expect(await sanitizeFileName('my-file.md')).toBe('my-file.md');
  });

  it('preserves filenames with spaces', async () => {
    expect(await sanitizeFileName('my file name.md')).toBe('my file name.md');
  });

  it('preserves filenames with underscores', async () => {
    expect(await sanitizeFileName('my_file.txt')).toBe('my_file.txt');
  });

  it('removes Windows forbidden characters', async () => {
    expect(await sanitizeFileName('file\\name:test*?.md')).toBe('filenametest.md');
  });

  it('removes angle brackets and pipes', async () => {
    expect(await sanitizeFileName('file<name>test|here.md')).toBe('filenametestandhere.md'.replace('and', ''));
    const result = await sanitizeFileName('file<>|.md');
    expect(result).toBe('file.md');
  });

  it('removes double quote characters', async () => {
    expect(await sanitizeFileName('file"name.md')).toBe('filename.md');
  });

  it('strips trailing dots and spaces from the base name', async () => {
    expect(await sanitizeFileName('myfile. . .md')).toBe('myfile.md');
  });

  it('strips leading and trailing whitespace from base name', async () => {
    expect(await sanitizeFileName('  hello  .md')).toBe('hello.md');
  });

  it('handles filenames without extensions', async () => {
    expect(await sanitizeFileName('just-a-name')).toBe('just-a-name');
  });

  it('preserves basic unicode letters', async () => {
    // Pre-composed unicode characters are preserved
    expect(await sanitizeFileName('caf\u00e9.md')).toBe('caf\u00e9.md');
  });

  it('strips combining marks (they are not in the allowed set)', async () => {
    // Combining acute accent (U+0301) is removed by the sanitizer
    expect(await sanitizeFileName('cafe\u0301.md')).toBe('cafe.md');
  });

  it('preserves CJK characters', async () => {
    expect(await sanitizeFileName('\u4f60\u597d\u4e16\u754c.md')).toBe('\u4f60\u597d\u4e16\u754c.md');
  });

  it('truncates long filenames to 100 characters total', async () => {
    const longName = 'a'.repeat(200) + '.md';
    const result = await sanitizeFileName(longName);
    expect([...result].length).toBeLessThanOrEqual(100);
    expect(result.endsWith('.md')).toBe(true);
  });

  it('truncates by code points not UTF-16 units', async () => {
    // Emoji are multi-byte; ensure we don't split surrogates
    const emojiName = '\u{1F600}'.repeat(50) + '.md';
    const result = await sanitizeFileName(emojiName);
    expect([...result].length).toBeLessThanOrEqual(100);
  });

  it('returns fallback when everything is stripped', async () => {
    expect(await sanitizeFileName('***???')).toBe('999-untitled.md');
  });

  it('returns fallback for empty string input', async () => {
    expect(await sanitizeFileName('')).toBe('999-untitled.md');
  });

  it('handles extension-only input (returns just the extension)', async () => {
    // base is empty but ext is .md, so result is '.md' which is truthy
    expect(await sanitizeFileName('.md')).toBe('.md');
  });

  it('handles multiple dots in filename', async () => {
    const result = await sanitizeFileName('file.name.backup.md');
    expect(result).toBe('file.name.backup.md');
  });
});

describe('rand5', () => {
  const context = loadSanitizeFileName();
  const { rand5 } = context;

  it('returns a string of length 5', async () => {
    const result = await rand5();
    expect(result).toHaveLength(5);
  });

  it('returns only alphanumeric characters', async () => {
    const result = await rand5();
    expect(result).toMatch(/^[A-Za-z0-9]{5}$/);
  });

  it('returns different values on multiple calls (probabilistic)', async () => {
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      results.add(await rand5());
    }
    // With 60^5 possible values, 20 calls should almost never collide
    expect(results.size).toBeGreaterThan(1);
  });
});
