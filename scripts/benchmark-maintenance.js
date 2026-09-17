// Usage: node scripts/benchmark-maintenance.js BASELINE_SOURCE CANDIDATE_SOURCE NEW_OUTPUT_DIR
const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');

async function run() {
  const [baseline, candidate, output] = process.argv.slice(2).map((value) => path.resolve(value));
  if (!baseline || !candidate || !output) throw new Error('Pass baseline source, candidate source, and a new output directory.');
  await fs.mkdir(output);
  const results = [];
  for (const count of [100, 1000, 5000]) {
    const board = path.join(output, `Fixture-${count}`);
    const hash = createHash('sha256');
    for (let list = 0; list < 5; list++) {
      const directory = path.join(board, `${String(list).padStart(3, '0')}-List${list}-stock`);
      await fs.mkdir(directory, { recursive: true });
      for (let card = 0; card < count / 5; card++) {
        const name = `${String(card).padStart(3, '0')}-fixture-${String(card).padStart(5, '0')}.md`;
        const body = `---\ntitle: Fixture ${list}-${card}\nlabels: [fixture]\n---\nNotes for card ${card}.\n- [ ] (start: 2026-09-16) (due: 2026-09-18) Open task\n- [x] (due: 2026-09-10) Done task\n`;
        await fs.writeFile(path.join(directory, name), body);
        hash.update(`${list}/${name}\n${body}`);
      }
    }
    const fixtureHash = hash.digest('hex');
    for (const operation of ['snapshot', 'exact-card']) {
      for (let sample = 0; sample < 6; sample++) {
        for (const [channel, source] of [['baseline', baseline], ['candidate', candidate]]) {
          const code = `const {performance}=require('perf_hooks');
            const fs=require('fs').promises; let reads=0; const original=fs.readFile;
            fs.readFile=async (...args)=>{reads++; return original(...args)};
            const source=process.argv[1],board=process.argv[2],operation=process.argv[3];
            const snapshot=require(source+'/lib/boardSnapshot'); const cli=require(source+'/lib/cliBoard');
            (async()=>{ const start=performance.now();
              const result=operation==='snapshot'? await snapshot.readBoardSnapshot(board,{includeBoardSettings:false}):await cli.resolveCard(board,{listRef:'000-List0-stock',cardRef:'000-fixture-00000.md'});
              console.log(JSON.stringify({ms:performance.now()-start,reads,rssBytes:process.memoryUsage().rss,errors:result.errors?.length||0,cards:result.lists?.flatMap(l=>l.cards).length}));
            })().catch(e=>{console.error(e);process.exitCode=1});`;
          const child = spawnSync(process.execPath, ['-e', code, source, board, operation], { encoding: 'utf8', timeout: 60000 });
          if (child.status !== 0) throw new Error(child.stderr || 'Benchmark child failed');
          const result = { channel, count, fixtureHash, operation, sample, first: sample === 0, ...JSON.parse(child.stdout) };
          results.push(result);
          await fs.appendFile(path.join(output, 'samples.jsonl'), `${JSON.stringify(result)}\n`);
        }
      }
    }
  }
  await fs.writeFile(path.join(output, 'environment.json'), JSON.stringify({ date: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, node: process.version, baseline, candidate, platform: process.platform }, null, 2));
  const summaries = [];
  for (const channel of ['baseline', 'candidate']) for (const count of [100, 1000, 5000]) for (const operation of ['snapshot', 'exact-card']) {
    const samples = results.filter((item) => item.channel === channel && item.count === count && item.operation === operation && !item.first);
    const values = samples.map((item) => item.ms).sort((a, b) => a - b);
    summaries.push({ channel, count, operation, medianMs: values[2], minMs: values[0], maxMs: values[4], reads: samples[0].reads, errors: samples.reduce((sum, item) => sum + item.errors, 0) });
  }
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
