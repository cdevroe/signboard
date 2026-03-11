#!/usr/bin/env node

const { runCli } = require('../lib/cliApp');

runCli(process.argv.slice(2), { commandName: 'signboard' })
  .then((exitCode) => {
    process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
  })
  .catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
