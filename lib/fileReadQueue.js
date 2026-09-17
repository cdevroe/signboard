// One budget shared by concurrent board snapshots and CLI card readers. A card
// read may also stat the file, so leave headroom for the rest of the process.
const MAX_CONCURRENT_READS = 16;
let active = 0;
const waiting = [];

async function withFileReadLimit(operation) {
  if (active >= MAX_CONCURRENT_READS) {
    await new Promise((resolve) => waiting.push(resolve));
  } else {
    active += 1;
  }
  try {
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

function mapFileReads(items, operation) {
  return Promise.all(items.map((item, index) => withFileReadLimit(() => operation(item, index))));
}

module.exports = { mapFileReads, withFileReadLimit };
