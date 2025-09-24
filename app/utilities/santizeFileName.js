async function sanitizeFileName(rawName) {
  // 1. Split into base name + extension (if any)
  const lastDot = rawName.lastIndexOf('.');
  const ext = (lastDot !== -1) ? rawName.slice(lastDot) : '';
  const base = (lastDot !== -1) ? rawName.slice(0, lastDot) : rawName;

  // 2. Remove unsafe chars
  // Allowed: letters, digits, space, underscore, hyphen, dot (only as separator)
  const allowed = /^[\p{L}\p{N}_\-.\s]+$/u;      // Unicode aware
  const cleanedBase = base
    .replace(/[\\\/:*?"<>|]/g, '')     // common Windows forbidden chars
    .replace(/[^\p{L}\p{N}_\-.\s]/gu, '') // remove everything else
    .trim();                          // strip leading/trailing whitespace

  // 3. Truncate to 100 chars *including* the extension
  const maxTotal = 100;
  const maxBase = Math.max(0, maxTotal - [...ext].length);

  // Use spread [...str] to safely cut by code‑points (not UTF‑16 surrogates)
  const truncatedBase = [...cleanedBase].slice(0, maxBase).join('');

  // 4. Windows forbids names ending in '.' or ' ' – strip those
  const finalBase = truncatedBase.replace(/[ .]+$/g, '');

  // 5. Return combined result
  const finalName = finalBase + ext;
  return finalName || '999-untitled.md'; // fallback if everything was stripped
}

async function rand5() {
  return [...Array(5)]
      .map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 60)))
        .join('');
}
            