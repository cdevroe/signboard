const fs = require('fs').promises;
const path = require('path');

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// Resolve the nearest existing ancestor for new files/directories as well as
// existing targets. A dangling symlink must never be mistaken for a new path.
async function canonicalPath(candidate) {
  const absolute = path.resolve(candidate);
  try {
    return await fs.realpath(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const entry = await fs.lstat(absolute).catch((statError) => {
      if (statError.code !== 'ENOENT') throw statError;
      return null;
    });
    if (entry) throw new Error('Unresolved symbolic link in path.');
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonicalPath(parent), path.basename(absolute));
  }
}

async function assertAllowedPath(allowedRoots, candidate, label = 'Path') {
  const roots = (await Promise.all(allowedRoots.map((root) => fs.realpath(root).catch(() => null)))).filter(Boolean);
  const resolved = await canonicalPath(candidate);
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} is outside SIGNBOARD_MCP_ALLOWED_ROOTS.`);
  }
  return resolved;
}

// Bulk import/archive operations may follow known nested files. Validate links
// before entering shared helpers, including links in otherwise hidden folders.
async function assertAllowedTree(allowedRoots, root, seen = new Set()) {
  const resolved = await assertAllowedPath(allowedRoots, root);
  if (seen.has(resolved)) return;
  seen.add(resolved);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink() || entry.isDirectory()) {
      await assertAllowedTree(allowedRoots, child, seen);
    }
  }
}

module.exports = { assertAllowedPath, assertAllowedTree, canonicalPath, isInside };
