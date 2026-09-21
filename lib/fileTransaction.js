const fs = require('fs').promises;
const path = require('path');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};

// Cooperating desktop/CLI/TUI writers serialize read-modify-write operations.
// Atomic replacement alone cannot protect a read from a concurrent writer.
async function withFileTransaction(filePath, action, { timeoutMs = 10000, createDirectory = true } = {}) {
  const lock = `${path.resolve(filePath)}.sb-lock`;
  if (createDirectory) await fs.mkdir(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let handle;
  while (!handle) {
    try {
      handle = await fs.open(lock, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
    } catch (error) {
      if (error.code !== 'EEXIST') {
        if (handle) { await handle.close(); await fs.unlink(lock).catch(() => {}); }
        throw error;
      }
      // Only one contender may recover a dead owner's lock at a time.
      let reaper;
      try {
        reaper = await fs.open(`${lock}.reap`, 'wx', 0o600);
        const owner = Number(await fs.readFile(lock, 'utf8'));
        const stat = await fs.stat(lock);
        if ((owner > 0 && !alive(owner)) || (!owner && Date.now() - stat.mtimeMs > 30000)) {
          await fs.unlink(lock);
        }
      } catch (failure) {
        if (!['EEXIST', 'ENOENT'].includes(failure.code)) throw failure;
      } finally {
        if (reaper) { await reaper.close(); await fs.unlink(`${lock}.reap`).catch(() => {}); }
      }
      if (Date.now() >= deadline) throw new Error(`Another Signboard process is saving ${path.basename(filePath)}. Retry shortly.`);
      await pause(20);
    }
  }
  try { return await action(); }
  finally { await handle.close(); await fs.unlink(lock).catch(() => {}); }
}

module.exports = { withFileTransaction };
